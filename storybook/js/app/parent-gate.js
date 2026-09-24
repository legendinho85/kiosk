// The grown-ups' gate: "press and hold for 3 seconds" in front of settings.
// A toddler taps, mashes or swipes; holding one finger still for three
// seconds is something they rarely do by accident. So the hold is cancelled
// by lifting the finger, sliding off the button, or a second finger landing.
// Keyboard users hold Space or Enter. A ring fills while holding and drains
// back when let go, so grown-ups can see what's happening.

import { h, icon, button, modal } from './ui.js';

export const HOLD_MS = 3000;

/**
 * The hold timer, without any DOM: start/cancel/tick with an injectable clock.
 * @param {{holdMs?: number, now?: () => number, onProgress?: (p: number) => void, onComplete?: () => void}} opts
 */
export function createHold({ holdMs = HOLD_MS, now = () => performance.now(), onProgress, onComplete } = {}) {
  let startedAt = null;
  let done = false;
  let progress = 0;
  const report = (p) => {
    progress = p;
    try {
      onProgress?.(p);
    } catch {
      /* UI problem only */
    }
  };
  return {
    /** Begin holding (no-op if already holding or unlocked). */
    start() {
      if (done || startedAt != null) return;
      startedAt = now();
      report(0);
    },
    /** Let go: progress drops back to zero. */
    cancel() {
      if (done || startedAt == null) return;
      startedAt = null;
      report(0);
    },
    /** Advance; returns the progress 0..1. Completes once when the hold reaches holdMs. */
    tick() {
      if (done) return 1;
      if (startedAt == null) return 0;
      const p = Math.min(1, Math.max(0, (now() - startedAt) / holdMs));
      report(p);
      if (p >= 1) {
        done = true;
        startedAt = null;
        try {
          onComplete?.();
        } catch (err) {
          console.warn('[gate] unlock handler failed', err);
        }
      }
      return p;
    },
    get holding() {
      return startedAt != null;
    },
    get done() {
      return done;
    },
    get progress() {
      return progress;
    },
  };
}

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

function holdMsFromHooks() {
  const ms = Number(globalThis.SB_TEST?.gateMs);
  return Number.isFinite(ms) && ms > 0 ? ms : HOLD_MS;
}

/**
 * The press-and-hold button itself.
 * @param {{holdMs?: number, onUnlock: () => void, label?: string}} opts
 * @returns {{el: HTMLElement, button: HTMLButtonElement, destroy(): void}}
 */
export function holdButton({ holdMs = holdMsFromHooks(), onUnlock, label = 'Grown-ups: press and hold for 3 seconds' } = {}) {
  const seconds = Math.round(holdMs / 1000);
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 100 100');
  ring.setAttribute('class', 'gate-ring');
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = `<circle class="gate-ring-track" cx="50" cy="50" r="${RING_R}"/><circle class="gate-ring-fill" cx="50" cy="50" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}" transform="rotate(-90 50 50)"/>`;
  const fill = ring.querySelector('.gate-ring-fill');
  const live = h('span', { class: 'sr-only', 'aria-live': 'assertive' });
  const hint = h('span', { class: 'gate-hint', id: `gate-hint-${Math.random().toString(36).slice(2, 7)}` }, `Hold for ${seconds} seconds`);
  const btn = h(
    'button',
    { type: 'button', class: 'gate-button', 'data-testid': 'parent-gate', 'aria-describedby': hint.id, 'aria-label': label },
    ring,
    h('span', { class: 'gate-icon' }, icon('lock', { size: 34 })),
  );
  const el = h('div', { class: 'gate' }, btn, hint, live);

  let raf = 0;
  let pointerId = null;
  let destroyed = false;

  const setRing = (p) => {
    fill.setAttribute('stroke-dashoffset', (RING_C * (1 - p)).toFixed(2));
  };
  const hold = createHold({
    holdMs,
    onProgress: (p) => {
      setRing(p);
      const left = Math.max(1, Math.ceil((holdMs * (1 - p)) / 1000));
      if (hold?.holding) hint.textContent = p > 0.02 ? `Keep holding… ${left}` : 'Keep holding…';
    },
    onComplete: () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onOtherPointer, true);
      el.classList.remove('is-holding');
      el.classList.add('is-unlocked');
      btn.replaceChildren(ring, h('span', { class: 'gate-icon' }, icon('check', { size: 36 })));
      setRing(1);
      hint.textContent = 'Unlocked';
      live.textContent = 'Unlocked';
      // Let the ring finish visibly before the screen changes.
      setTimeout(() => !destroyed && onUnlock?.(), 260);
    },
  });

  const loop = () => {
    hold.tick();
    if (hold.holding) raf = requestAnimationFrame(loop);
  };
  // A second finger anywhere on the screen means mashing, not holding.
  const onOtherPointer = (e) => {
    if (pointerId != null && e.pointerId !== pointerId) end();
  };
  const begin = () => {
    if (hold.done || hold.holding) return;
    hold.start();
    document.addEventListener('pointerdown', onOtherPointer, true);
    el.classList.add('is-holding');
    hint.textContent = 'Keep holding…';
    live.textContent = 'Keep holding';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };
  const end = () => {
    if (!hold.holding) return;
    cancelAnimationFrame(raf);
    hold.cancel();
    document.removeEventListener('pointerdown', onOtherPointer, true);
    el.classList.remove('is-holding');
    pointerId = null;
    hint.textContent = `Hold for ${seconds} seconds`;
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // A second finger means mashing, not holding.
    if (pointerId != null && e.pointerId !== pointerId) return end();
    pointerId = e.pointerId;
    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
    begin();
  });
  // Moving off the button (captured pointers report their position) cancels.
  btn.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !hold.holding) return;
    const r = btn.getBoundingClientRect();
    const slack = 24;
    if (e.clientX < r.left - slack || e.clientX > r.right + slack || e.clientY < r.top - slack || e.clientY > r.bottom + slack) end();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(type, end);
  btn.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) begin();
  });
  btn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') end();
  });
  btn.addEventListener('blur', end);
  // Long-press would otherwise open the phone's context menu / text selection.
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // A plain click (tap) does nothing but explain.
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!hold.done && !hold.holding) {
      el.classList.remove('is-nudged');
      void el.offsetWidth;
      el.classList.add('is-nudged');
      hint.textContent = `Press and hold for ${seconds} seconds`;
    }
  });

  return {
    el,
    button: btn,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onOtherPointer, true);
    },
  };
}

/**
 * Show the gate as a dialog. Resolves true once a grown-up has held it,
 * false if they closed it.
 * @param {{holdMs?: number, title?: string}} [opts]
 * @returns {Promise<boolean>}
 */
export function openParentGate({ holdMs, title = 'Grown-ups only' } = {}) {
  return new Promise((resolve) => {
    let unlocked = false;
    let dlg = null;
    const gate = holdButton({
      holdMs,
      onUnlock: () => {
        unlocked = true;
        markGatePassed();
        dlg?.close();
      },
    });
    const body = h(
      'div',
      { class: 'gate-dialog-body' },
      h('p', { class: 'gate-lead' }, 'Press and hold the lock for 3 seconds to open the settings.'),
      gate.el,
      button({ text: 'Not now', variant: 'quiet', testid: 'parent-gate-cancel', onClick: () => dlg?.close() }),
    );
    dlg = modal({
      title,
      body,
      className: 'dialog-gate',
      onClose: () => {
        gate.destroy();
        resolve(unlocked);
      },
    });
    gate.button.focus();
  });
}

// Once a grown-up has held the gate, don't ask again until the app reloads.
let passedAt = 0;
const PASS_MS = 10 * 60 * 1000;

/** Remember that the gate was passed (for this page load, for ten minutes). */
export function markGatePassed() {
  passedAt = Date.now();
}

/** Has a grown-up passed the gate recently? */
export function gatePassed() {
  return passedAt > 0 && Date.now() - passedAt < PASS_MS;
}
