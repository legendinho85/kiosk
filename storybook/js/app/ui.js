// Tiny DOM helpers for the grown-up screens: an element builder, inline SVG
// icons (no icon font, no network), buttons, toasts and a confirm dialog.
// Everything here builds real, accessible HTML: <button>s with labels,
// decorative icons hidden from screen readers.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 *   h('button', { class: 'btn', onClick: fn, 'data-testid': 'x', disabled: false }, 'Label', icon('play'))
 * Attributes: `class`, `style` (string or object), `dataset` (object), `text`,
 * `html` (trusted markup only: our own icons), `on<Event>` listeners, `ref`
 * (called with the element), booleans (true adds the attribute, false/null
 * leaves it off) and properties that must be set directly (`value`, `checked`).
 * Children may be strings, numbers, nodes, arrays or null.
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'ref') v(el);
    else if (k === 'value' || k === 'checked' || k === 'indeterminate') el[k] = v;
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** A DocumentFragment of children (same rules as h()). */
export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

// ---- Icons --------------------------------------------------------------------

// 24×24, 2.2 px round strokes. Drawn for this app (no third-party icon set).
const S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
const GEAR = 'M19.18 9.49L21.89 10.51L21.89 13.49L19.18 14.51L18.85 15.30L20.04 17.94L17.94 20.04L15.30 18.85L14.51 19.18L13.49 21.89L10.51 21.89L9.49 19.18L8.70 18.85L6.06 20.04L3.96 17.94L5.15 15.30L4.82 14.51L2.11 13.49L2.11 10.51L4.82 9.49L5.15 8.70L3.96 6.06L6.06 3.96L8.70 5.15L9.49 4.82L10.51 2.11L13.49 2.11L14.51 4.82L15.30 5.15L17.94 3.96L20.04 6.06L18.85 8.70Z';

export const ICONS = Object.freeze({
  play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>',
  check: `<path d="M5 12.5l4.5 4.5L19 7.5" ${S} stroke-width="2.8"/>`,
  mic: `<rect x="9" y="3" width="6" height="11" rx="3" ${S}/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" ${S}/>`,
  record: '<circle cx="12" cy="12" r="6.5" fill="currentColor"/>',
  camera: `<rect x="3" y="7" width="18" height="12.5" rx="3" ${S}/><circle cx="12" cy="13.2" r="3.3" ${S}/><path d="M8.5 7 10 4.5h4L15.5 7" ${S}/>`,
  settings: `<path d="${GEAR}" ${S} stroke-width="2"/><circle cx="12" cy="12" r="3.2" ${S} stroke-width="2"/>`,
  back: `<path d="M14.5 5.5 8 12l6.5 6.5" ${S} stroke-width="2.6"/>`,
  forward: `<path d="M9.5 5.5 16 12l-6.5 6.5" ${S} stroke-width="2.6"/>`,
  arrow: `<path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" ${S} stroke-width="2.6"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" ${S} stroke-width="2.6"/>`,
  star: '<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  sparkle: '<path d="M12 2.5c.7 4.6 2.6 6.6 7.2 7.3-4.6.7-6.5 2.7-7.2 7.3-.7-4.6-2.6-6.6-7.2-7.3 4.6-.7 6.5-2.7 7.2-7.3z" fill="currentColor"/><path d="M19 15.5c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z" fill="currentColor"/>',
  speaker: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" ${S}/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${S}/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" ${S}/>`,
  shield: `<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" ${S}/><path d="M8.8 12.2l2.2 2.2 4.2-4.4" ${S}/>`,
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" fill="currentColor"/>',
  edit: `<path d="M4.5 19.5l1-4.2L15.8 5a2.1 2.1 0 0 1 3 0l.2.2a2.1 2.1 0 0 1 0 3L8.7 18.5z" ${S}/><path d="M13.8 7l3.2 3.2" ${S}/>`,
  trash: `<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.5h9l1-12.5" ${S}/>`,
  plus: `<path d="M12 5v14M5 12h14" ${S} stroke-width="2.6"/>`,
  qr: `<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" ${S}/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" ${S}/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" ${S}/><path d="M14 14h2.5v2.5M20.5 14v6.5H17M14 18.5v2" ${S}/>`,
  print: `<path d="M7 9V3.5h10V9M7 17H4.5V10.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V17H17" ${S}/><rect x="7" y="14" width="10" height="6.5" rx="1" ${S}/>`,
  copy: `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" ${S}/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" ${S}/>`,
  book: `<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20" ${S}/>`,
  home: `<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" ${S}/>`,
  hand: `<path d="M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11M14.5 11V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 6.5-6 6.5-2.6 0-4.1-1.2-5.6-3.6L4 13.5a1.4 1.4 0 0 1 2.3-1.6l2.2 2.6" ${S} stroke-width="1.9"/>`,
  info: `<circle cx="12" cy="12" r="9" ${S}/><path d="M12 11v5.5M12 7.6v.2" ${S} stroke-width="2.6"/>`,
  alert: `<path d="M12 3.5 21 19.5H3z" ${S}/><path d="M12 10v4.5M12 17.2v.2" ${S} stroke-width="2.6"/>`,
  ear: `<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 3.8-3 6.5-.4 2.2-1.6 4-3.8 4A3.2 3.2 0 0 1 7 16.3" ${S}/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.2-1 1.6-1.4 2.3" ${S}/>`,
  wave: `<path d="M4 12h1.5M8 8v8M12 5v14M16 8v8M19.5 12H20" ${S} stroke-width="2.4"/>`,
  refresh: `<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5 4.5v4h4" ${S}/>`,
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/>',
  ball: `<circle cx="12" cy="12" r="8.5" ${S}/><path d="M12 7.8l3.4 2.5-1.3 4h-4.2l-1.3-4zM12 3.5v4.3M15.4 10.3l4.2-1.3M14.1 14.3l2.6 3.5M9.9 14.3l-2.6 3.5M8.6 10.3 4.4 9" ${S} stroke-width="1.7"/>`,
  // Family features
  gift: `<rect x="3.5" y="8.5" width="17" height="4.5" rx="1.2" ${S}/><path d="M5 13v7h14v-7M12 8.5V20" ${S}/><path d="M12 8.5C10.5 5 6.8 4.2 6.8 6.6c0 1.6 2.6 1.9 5.2 1.9zM12 8.5c1.5-3.5 5.2-4.3 5.2-1.9 0 1.6-2.6 1.9-5.2 1.9z" ${S} stroke-width="2"/>`,
  share: `<path d="M12 14.5V3.8M8 7.5l4-4 4 4" ${S} stroke-width="2.4"/><path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2" ${S}/>`,
  download: `<path d="M12 3.8v11M7.8 10.8l4.2 4.2 4.2-4.2" ${S} stroke-width="2.4"/><path d="M4.5 16.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" ${S}/>`,
  file: `<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" ${S}/><path d="M14 3.5V8h4.5" ${S}/><path d="M12 11.2c-.9-1.5-3.4-1.2-3.4.8 0 1.8 3.4 3.8 3.4 3.8s3.4-2 3.4-3.8c0-2-2.5-2.3-3.4-.8z" fill="currentColor"/>`,
  users: `<circle cx="9" cy="8.5" r="3.3" ${S}/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" ${S}/><circle cx="16.6" cy="9.3" r="2.6" ${S} stroke-width="2"/><path d="M16.8 14.3c2.2.2 3.8 1.8 4.2 4.4" ${S} stroke-width="2"/>`,
  note: `<path d="M9.5 17.5V5.5l10-2v12" ${S}/><circle cx="7" cy="17.5" r="2.6" fill="currentColor"/><circle cx="17" cy="15.5" r="2.6" fill="currentColor"/>`,
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/>',
  skip: `<path d="M6 6.5l7 5.5-7 5.5zM17.5 6v12" ${S}/>`,
  // Round 3
  sticker: `<path d="M20.5 12.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h6.5z" ${S}/><path d="M12.5 20.5v-5.5a2.5 2.5 0 0 1 2.5-2.5h5.5" ${S}/><path d="M8.5 9.5h.1M13 9.5h.1" ${S} stroke-width="2.8"/><path d="M8 13.2c.9 1.1 2.2 1.5 3.4 1.2" ${S} stroke-width="1.9"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" ${S}/><circle cx="12" cy="12" r="3" ${S}/>`,
  letter: `<path d="M5 19.5 11 4.5h2l6 15M7.4 13.8h9.2" ${S} stroke-width="2.4"/>`,
});

/**
 * An inline SVG icon. Decorative (aria-hidden) unless `label` is given.
 * @param {keyof typeof ICONS} name
 * @param {{size?: number, label?: string, class?: string}} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, { size = 24, label = '', class: cls = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `icon icon-${name}${cls ? ` ${cls}` : ''}`);
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

// Tiffin's face, from the book's own art library (d-tf-head in defs.svg), with
// the eyes and smile the poses add. Used as the brand mark and app icon.
const TIFFIN_HEAD =
  '<g stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><circle cx="-112" cy="-50" r="20" fill="#B0703F" stroke="#7B4A26"/><circle cx="-111" cy="-48" r="9.5" fill="#8A5530" stroke="none"/><circle cx="112" cy="-50" r="20" fill="#B0703F" stroke="#7B4A26"/><circle cx="111" cy="-48" r="9.5" fill="#8A5530" stroke="none"/><path d="M-34 -88C-44 -118 -30 -140 -8 -142C-22 -128 -22 -112 -12 -96C-10 -128 8 -150 34 -146C16 -136 10 -118 14 -98C22 -118 40 -128 60 -120C44 -112 38 -100 38 -84Z" fill="#8A5530" stroke="#5F3719"/><ellipse cx="0" cy="0" rx="128" ry="104" fill="#B0703F" stroke="#7B4A26"/><path d="M-104 50C-70 96 70 96 104 50C84 88 44 102 0 102C-44 102 -84 88 -104 50Z" fill="#9C6035" stroke="none"/><ellipse cx="-94" cy="14" rx="18" ry="11" fill="#EE8C78" stroke="none" opacity=".85"/><ellipse cx="94" cy="14" rx="18" ry="11" fill="#EE8C78" stroke="none" opacity=".85"/><path d="M0 20C14 -2 74 -4 78 40C80 72 34 88 0 100C-34 88 -80 72 -78 40C-74 -4 -14 -2 0 20Z" fill="#F7E6CC" stroke="#CFAB80"/><circle cx="-44" cy="50" r="3" fill="#CFAB80" stroke="none"/><circle cx="-30" cy="58" r="3" fill="#CFAB80" stroke="none"/><circle cx="-50" cy="64" r="3" fill="#CFAB80" stroke="none"/><circle cx="44" cy="50" r="3" fill="#CFAB80" stroke="none"/><circle cx="30" cy="58" r="3" fill="#CFAB80" stroke="none"/><circle cx="50" cy="64" r="3" fill="#CFAB80" stroke="none"/><path d="M66 46Q104 36 144 34M68 58Q108 58 148 62M64 70Q100 78 138 90M-66 46Q-104 36 -144 34M-68 58Q-108 58 -148 62M-64 70Q-100 78 -138 90" fill="none" stroke="#3A2A20" stroke-width="4"/><path d="M-19 8L19 8L0 29Z" fill="#3A2A20" stroke="#3A2A20" stroke-width="9"/><ellipse cx="-6" cy="11" rx="5" ry="3" fill="#fff" stroke="none" opacity=".55"/>' +
  '<circle cx="-46" cy="-22" r="17" fill="#2B1E16" stroke="none"/><circle cx="46" cy="-22" r="17" fill="#2B1E16" stroke="none"/><circle cx="-40" cy="-28" r="6" fill="#fff" stroke="none"/><circle cx="52" cy="-28" r="6" fill="#fff" stroke="none"/>' +
  '<path d="M0 29V40M-22 40Q-11 54 0 40Q11 54 22 40" fill="none" stroke="#3A2A20" stroke-width="5"/></g>';

/** Tiffin's face as an <svg> (decorative unless labelled). */
export function tiffinMark({ size = 40, label = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-160 -160 320 272');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * 272) / 320)));
  svg.setAttribute('class', 'tiffin-mark');
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = TIFFIN_HEAD;
  return svg;
}

// ---- Buttons ------------------------------------------------------------------

/**
 * A real <button>. Icon-only buttons must pass `label` (used for aria-label).
 * @param {{text?: string, label?: string, icon?: string, iconAfter?: string, variant?: 'primary'|'secondary'|'ghost'|'quiet'|'danger'|'link',
 *   size?: 'lg'|'md'|'sm', testid?: string, onClick?: (e: Event) => void, type?: string, class?: string, attrs?: object}} opts
 * @returns {HTMLButtonElement}
 */
export function button({ text = '', label = '', icon: ic = '', iconAfter = '', variant = 'secondary', size = 'md', testid, onClick, type = 'button', class: cls = '', attrs = {} } = {}) {
  const iconOnly = !text;
  const el = h(
    'button',
    {
      type,
      class: ['btn', `btn-${variant}`, `btn-${size}`, iconOnly && 'btn-icon', cls],
      'data-testid': testid,
      'aria-label': label || null,
      title: iconOnly ? label : null,
      ...attrs,
    },
    ic ? icon(ic, { size: size === 'sm' ? 18 : 22 }) : null,
    text ? h('span', { class: 'btn-text' }, text) : null,
    iconAfter ? icon(iconAfter, { size: size === 'sm' ? 18 : 22 }) : null,
  );
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/** An <a> styled as a button, for real navigation (keeps middle-click / long-press). */
export function linkButton({ text, href, label = '', icon: ic = '', iconAfter = '', variant = 'secondary', size = 'md', testid, class: cls = '' }) {
  return h(
    'a',
    { href, class: ['btn', `btn-${variant}`, `btn-${size}`, cls], 'data-testid': testid, 'aria-label': label || null },
    ic ? icon(ic, { size: 22 }) : null,
    h('span', { class: 'btn-text' }, text),
    iconAfter ? icon(iconAfter, { size: 22 }) : null,
  );
}

/** Put a button into a busy state (spinner, disabled, aria-busy) and back. */
export function setBusy(btn, busy) {
  btn.classList.toggle('is-busy', Boolean(busy));
  btn.toggleAttribute('aria-busy', Boolean(busy));
  btn.disabled = Boolean(busy);
}

/** Visually hidden text for screen readers. */
export function srOnly(text) {
  return h('span', { class: 'sr-only' }, text);
}

// ---- Toasts -------------------------------------------------------------------

let toastHost = null;

function host() {
  if (toastHost?.isConnected) return toastHost;
  toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  document.body.append(toastHost);
  return toastHost;
}

/** Remove every toast (e.g. before the child-facing reader opens). */
export function clearToasts() {
  toastHost?.replaceChildren();
}

/**
 * Show a short message at the bottom of the screen.
 * @param {string} message
 * @param {{kind?: 'info'|'success'|'error', timeout?: number}} [opts]
 * @returns {() => void} dismiss
 */
export function toast(message, { kind = 'info', timeout = 4200 } = {}) {
  try {
    const box = host();
    // Don't stack the same message (e.g. a flaky connection reporting twice).
    for (const t of box.children) if (t.dataset.msg === message) t.remove();
    const el = h(
      'div',
      { class: `toast toast-${kind}`, dataset: { msg: message } },
      icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info', { size: 20 }),
      h('span', { class: 'toast-text' }, message),
    );
    const close = () => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    };
    const btn = button({ label: 'Dismiss', icon: 'close', variant: 'quiet', size: 'sm', onClick: close });
    el.append(btn);
    box.append(el);
    const timer = setTimeout(close, timeout);
    return () => {
      clearTimeout(timer);
      close();
    };
  } catch {
    return () => {};
  }
}

// ---- Dialogs ------------------------------------------------------------------

/**
 * An accessible modal dialog. Uses <dialog>.showModal() (focus trap, Esc) when
 * available and a plain overlay otherwise.
 * @param {{title: string, body?: Node|string, className?: string, onClose?: () => void, labelledBy?: string}} opts
 * @returns {{el: HTMLElement, panel: HTMLElement, close: () => void}}
 */
export function modal({ title, body = null, className = '', onClose } = {}) {
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const panel = h('div', { class: 'dialog-panel' }, h('h2', { id: titleId, class: 'dialog-title' }, title), body);
  const useDialog = typeof HTMLDialogElement === 'function' && typeof document.createElement('dialog').showModal === 'function';
  const el = h(useDialog ? 'dialog' : 'div', { class: `dialog ${className}`, 'aria-labelledby': titleId, role: useDialog ? null : 'dialog', 'aria-modal': useDialog ? null : 'true' }, panel);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      if (useDialog && el.open) el.close();
    } catch {
      /* ignore */
    }
    el.remove();
    try {
      onClose?.();
    } catch {
      /* ignore */
    }
  };
  document.body.append(el);
  if (useDialog) {
    el.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    // A click on the backdrop (outside the panel) closes it.
    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
    try {
      el.showModal();
    } catch {
      el.setAttribute('open', '');
    }
  } else {
    el.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  }
  return { el, panel, close };
}

/**
 * Ask a yes/no question. Resolves true when confirmed.
 * @param {{title: string, message?: string, confirmText?: string, cancelText?: string, danger?: boolean, testid?: string}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmText = 'Yes', cancelText = 'Cancel', danger = false, testid = 'confirm' }) {
  return new Promise((resolve) => {
    let answer = false;
    const yes = button({ text: confirmText, variant: danger ? 'danger' : 'primary', testid: `${testid}-yes`, onClick: () => ((answer = true), dlg.close()) });
    const no = button({ text: cancelText, variant: 'secondary', testid: `${testid}-no`, onClick: () => dlg.close() });
    const body = frag(message ? h('p', { class: 'dialog-text' }, message) : null, h('div', { class: 'dialog-actions' }, no, yes));
    const dlg = modal({ title, body, className: 'dialog-confirm', onClose: () => resolve(answer) });
    dlg.el.dataset.testid = testid;
    // Safer default: focus "Cancel" for destructive questions.
    (danger ? no : yes).focus();
  });
}

// ---- Misc ---------------------------------------------------------------------

/** Debounce a function (trailing call). The returned function has .cancel() and .flush(). */
export function debounce(fn, ms) {
  let t = null;
  let lastArgs = null;
  const run = () => {
    t = null;
    const a = lastArgs;
    lastArgs = null;
    fn(...(a ?? []));
  };
  const d = (...args) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(run, ms);
  };
  d.cancel = () => {
    clearTimeout(t);
    t = null;
    lastArgs = null;
  };
  d.flush = () => {
    if (t) {
      clearTimeout(t);
      run();
    }
  };
  return d;
}

/** Does the user prefer reduced motion? */
export function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * A respelling like "shih-VAWN" as HTML-safe nodes, with the stressed
 * (capitalised) syllable emphasised so it reads at a glance.
 * @param {string} respell
 * @returns {HTMLElement}
 */
export function respellNode(respell) {
  const wrap = h('span', { class: 'respell', lang: 'en-GB' });
  for (const part of respellParts(respell)) wrap.append(part.stressed ? h('strong', {}, part.text) : part.text);
  return wrap;
}

/**
 * Split a respelling into runs, marking the stressed (all-capitals) syllables.
 * "shih-VAWN" -> [{text:'shih-', stressed:false}, {text:'VAWN', stressed:true}]
 * A respelling typed all in capitals has no stress marks, so nothing is marked.
 * @param {string} respell
 * @returns {Array<{text: string, stressed: boolean}>}
 */
export function respellParts(respell) {
  const s = String(respell ?? '');
  const hasLower = /[a-z]/.test(s);
  const out = [];
  for (const part of s.split(/([\s-]+)/)) {
    if (!part) continue;
    const letters = part.replace(/[^A-Za-z]/g, '');
    const stressed = hasLower && letters.length > 0 && letters === letters.toUpperCase();
    const last = out[out.length - 1];
    if (last && last.stressed === stressed) last.text += part;
    else out.push({ text: part, stressed });
  }
  return out;
}
