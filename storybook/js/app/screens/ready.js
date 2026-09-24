// "Siobhan's story is ready": the cover with the name on it, a big Start
// button, the magic window (when there's a camera), who we're reading for
// and how we say it, and a short how-to for grown-ups.
//
// Family features (docs/architecture.md §11): siblings reading together
// (up to three, "Amara & Zak"), who reads the story (the computer voice or a
// grown-up's recorded reading), bedtime mode, a gift message from whoever
// gave the book, saving a recorded reading as audio for a Yoto card or a
// Creative-Tonie, and asking about online voices when that's the only kind
// this browser has. Round 3 (§12): name stickers for the printed book.

import { h, icon, button, linkButton, respellNode, toast, setBusy } from '../ui.js';
import { screen, privacyLine, envBanner, voiceConsentCard } from '../chrome.js';
import { createCover } from '../cover.js';
import { person as makePerson } from '../../core/personalise.js';
import { readingChildren, setTogether, readingsFor, activeReadingFor, readingLabel } from '../../core/storage.js';
import { planLines } from '../../narrator/plan.js';
import { readingPerson, recordingSteps, readingCoverage, MAX_TOGETHER, artNames, selectChild } from '../../family/family.js';
import { saveReadingAudio, yotoTip } from '../family-ui.js';

/** How the saved pronunciation is described to the parent ("shih-VAWN", or “Siobhan” as written). */
export function pronunciationSummary(profile) {
  const p = profile?.pronunciation ?? {};
  if (p.useRecording && p.recordingId) return { kind: 'recording', text: 'your recording' };
  if (p.respell) return { kind: 'respell', text: p.respell };
  const say = p.say || profile?.display || '';
  return { kind: 'say', text: say };
}

/** A person object for the narrator from a saved profile. */
export function profilePerson(profile) {
  return makePerson(profile.display, profile.pronunciation?.say || profile.display);
}

/** Play the child's name the way the story will say it (voice or recording). */
export async function sayName(ctx, profile, { signal } = {}) {
  const pr = profile.pronunciation ?? {};
  const plan = planLines(['{name}'], profilePerson(profile), { useRecording: Boolean(pr.useRecording), recordingId: pr.recordingId ?? null });
  try {
    ctx.narrator.stop?.();
    return await ctx.narrator.play(plan, { signal });
  } catch {
    return 'stopped';
  }
}

/**
 * The ids to store when a child is ticked or unticked in "Reading together".
 * The active child can't be unticked when they're the only one; at most three.
 * @param {string[]} current ids reading now (active first)
 * @param {string} id the child ticked or unticked
 * @param {boolean} on
 * @returns {string[]}
 */
export function togetherIds(current, id, on) {
  const set = current.filter((x) => x !== id);
  if (on) set.push(id);
  if (!set.length) return current;
  return set.slice(0, MAX_TOGETHER);
}

/** "Recorded 24 Sep · every page" */
export function readingMeta(reading, steps, now = new Date()) {
  const cov = readingCoverage(reading, steps);
  const when = reading?.updatedAt ? new Date(reading.updatedAt) : null;
  const date = when ? when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(when.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }) : '';
  const how = cov.complete ? 'every page' : `${cov.done} of ${cov.total} parts`;
  const lang = reading?.language && !/^english$/i.test(reading.language) ? ` · in ${reading.language}` : '';
  return `${date ? `Recorded ${date} · ` : ''}${how}${lang}`;
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {object} profile the active child
 */
export function renderReady(root, ctx, profile) {
  let inner = null;
  let painted = false;
  // One live cover for the life of the screen: repainting (a new reader, bedtime, siblings) just renames it.
  const first = readingPerson(ctx.state) ?? profilePerson(profile);
  const cover = createCover({ book: ctx.book, bookId: ctx.bookId, baseUrl: ctx.baseUrl, display: first.display, art: first.art, signal: ctx.signal });
  const paint = (focus = null) => {
    try {
      inner?.();
    } catch {
      /* ignore */
    }
    // A "reading together" group that no longer includes the child we're reading for is stale.
    const group = ctx.state.together ?? [];
    if (group.length && !group.includes(ctx.state.activeProfileId)) ctx.setState((s) => ({ ...s, together: [] }));
    root.replaceChildren();
    const current = ctx.state.profiles.find((p) => p.id === ctx.state.activeProfileId) ?? profile;
    inner = paintReady(root, ctx, current, paint, { cover, repaint: painted });
    painted = true;
    if (focus) {
      const target = root.querySelector(focus);
      try {
        target?.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  };
  paint();
  return () => inner?.();
}

function paintReady(root, ctx, profile, repaint, { cover, repaint: again = false }) {
  const bookId = ctx.bookId;
  const book = ctx.book;
  const others = ctx.state.profiles.filter((p) => p.id !== profile.id);
  const life = new AbortController();
  const signal = AbortSignal.any ? AbortSignal.any([life.signal, ctx.signal].filter(Boolean)) : life.signal;
  const kids = readingChildren(ctx.state);
  const together = kids.length > 1;
  const who = readingPerson(ctx.state) ?? profilePerson(profile);
  const reading = activeReadingFor(ctx.state, bookId);
  const readings = readingsFor(ctx.state, bookId);
  const steps = recordingSteps(book);
  const bedtime = Boolean(ctx.state.settings?.bedtime);
  let playCtl = null;

  const stopPlaying = () => {
    playCtl?.abort();
    playCtl = null;
    for (const b of root.querySelectorAll('.is-playing')) b.classList.remove('is-playing');
  };
  async function playBlob(btn, blob) {
    const mine = btn.classList.contains('is-playing');
    stopPlaying();
    if (mine || !blob) return;
    playCtl = new AbortController();
    const my = playCtl;
    btn.classList.add('is-playing');
    try {
      const rec = await import('../../audio/recorder.js');
      await rec.playBlob(blob, { signal: my.signal });
    } catch {
      toast('That recording won’t play on this device.', { kind: 'error' });
    } finally {
      btn.classList.remove('is-playing');
      if (playCtl === my) playCtl = null;
    }
  }
  const firstPartBlob = async (r) => {
    for (const s of steps) {
      const id = r.parts?.[s.n]?.[s.part];
      if (id) return ctx.blobs.get(id).catch(() => null);
    }
    return null;
  };

  cover.setName(who.display, { art: who.art, pop: again });

  const start = linkButton({ text: bedtime ? 'Start the bedtime story' : 'Start reading', href: `#/b/${bookId}/read/1`, icon: bedtime ? 'moon' : 'play', variant: 'primary', size: 'xl', testid: 'start-reading', class: `start-button${bedtime ? ' is-bedtime' : ''}` });
  const magicBtn = linkButton({ text: 'Magic window', href: `#/b/${bookId}/magic/1`, icon: 'camera', variant: 'secondary', size: 'lg', testid: 'open-magic', class: 'magic-button' });
  const magicNote = h('p', { class: 'magic-note' }, icon('sparkle', { size: 18 }), h('span', {}, `Point your camera at the real book and watch ${who.display}’s ${(who.count ?? 1) > 1 ? 'names' : 'name'} appear on the page. We look at the page; nothing is recorded.`));
  const magicWrap = h('div', { class: 'magic-wrap', hidden: true }, magicBtn, magicNote);

  // Only offer the magic window when this device can do it.
  import('../../ar/magic-window.js')
    .then((m) => {
      if (!ctx.signal?.aborted && m.isCameraSupported?.()) magicWrap.hidden = false;
    })
    .catch(() => {
      /* not built yet or unavailable: simply don't offer it */
    });

  // What will happen when they press Start: whose voice, and whether it's bedtime.
  const pills = h('div', { class: 'ready-pills' },
    reading && !together ? h('span', { class: 'ready-pill', 'data-testid': 'reading-pill' }, icon('heart', { size: 16 }), readingLabel(reading)) : null,
    bedtime ? h('span', { class: 'ready-pill is-night', 'data-testid': 'bedtime-pill' }, icon('moon', { size: 16 }), 'Bedtime mode') : null);
  const addGiftPill = (card, from) =>
    pills.prepend(h('button', {
      type: 'button',
      class: 'ready-pill is-gift',
      'data-testid': 'gift-pill',
      onClick: () => {
        card.scrollIntoView?.({ block: 'center', behavior: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        card.querySelector('h2')?.focus({ preventScroll: true });
      },
    }, icon('gift', { size: 16 }), from ? `A message from ${from}` : 'A message for you'));

  // ---- Who we're reading for ---------------------------------------------------------
  const summary = pronunciationSummary(profile);
  const hearBtn = button({ text: 'Listen', label: `Listen to how we say ${profile.display}`, icon: 'speaker', variant: 'soft', size: 'sm', testid: 'hear-name', class: 'hear-name' });
  hearBtn.addEventListener('click', async () => {
    hearBtn.classList.add('is-playing');
    await sayName(ctx, profile, { signal: life.signal });
    hearBtn.classList.remove('is-playing');
  });
  const saidAs = h(
    'p',
    { class: 'said-as' },
    'We say it ',
    summary.kind === 'respell' ? respellNode(summary.text) : summary.kind === 'recording' ? h('strong', {}, 'with your recording') : h('strong', {}, `“${summary.text}”`),
  );

  const childCard = h(
    'section',
    { class: 'card child-card', 'aria-labelledby': 'reading-for' },
    h('div', { class: 'child-card-top' },
      h('span', { class: 'child-avatar', 'aria-hidden': 'true' }, [...profile.display][0]?.toLocaleUpperCase('en-GB') ?? '★'),
      h('div', { class: 'child-card-text' },
        h('h2', { id: 'reading-for', class: 'child-card-title' }, 'Reading for ', h('span', { class: 'child-name', 'data-testid': 'active-child' }, profile.display)),
        profile.fullName ? h('p', { class: 'child-fullname' }, `Full name: ${profile.fullName}`) : null)),
    h('div', { class: 'said-row' }, saidAs, hearBtn),
    h('div', { class: 'child-links' },
      linkButton({ text: 'Change name', href: `#/b/${bookId}/name?child=${encodeURIComponent(profile.id)}`, icon: 'edit', variant: 'link', size: 'sm', testid: 'change-child' }),
      linkButton({ text: 'Change how we say it', href: `#/b/${bookId}/say`, icon: 'ear', variant: 'link', size: 'sm', testid: 'change-say' }),
      linkButton({ text: 'Add a child', href: `#/b/${bookId}/name`, icon: 'plus', variant: 'link', size: 'sm', testid: 'add-child' })),
    others.length && !together
      ? h('div', { class: 'switch-child-row' },
          h('span', { class: 'switch-label' }, 'Switch to'),
          others.map((p) => button({
            text: p.display,
            variant: 'chip',
            size: 'sm',
            testid: 'switch-child',
            attrs: { 'data-child': p.id },
            onClick: () => {
              ctx.setState((s) => selectChild(s, p.id));
              ctx.navigate(`#/b/${bookId}`);
            },
          })))
      : null,
    others.length ? togetherPicker() : null,
  );

  function togetherPicker() {
    const ids = kids.map((k) => k.id);
    const full = ids.length >= MAX_TOGETHER;
    // The child we're reading for is always in; tick brothers and sisters to add them.
    const chips = others.map((p) => {
      const id = `together-${p.id}`;
      const on = ids.includes(p.id);
      const input = h('input', {
        type: 'checkbox',
        id,
        class: 'together-input',
        'data-testid': 'together-child',
        'data-child': p.id,
        checked: on,
        disabled: !on && full,
        onChange: (e) => {
          const next = togetherIds(ids, p.id, e.target.checked);
          ctx.setState((s) => {
            const st = setTogether(s, next);
            return { ...st, activeProfileId: next.includes(s.activeProfileId) ? s.activeProfileId : next[0] };
          });
          repaint(`[data-testid=together-child][data-child="${p.id}"]`);
        },
      });
      return h('label', { class: `together-chip${on ? ' is-on' : ''}`, for: id }, input, h('span', { class: 'together-tick', 'aria-hidden': 'true' }, icon('check', { size: 14 })), h('span', {}, p.display));
    });
    return h(
      'div',
      { class: 'together', role: 'group', 'aria-labelledby': 'together-title' },
      h('p', { class: 'together-title', id: 'together-title' }, icon('users', { size: 20 }), h('span', {}, `Reading together with ${profile.display}?`)),
      h('div', { class: 'together-chips' }, chips),
      together
        ? h('p', { class: 'together-names' }, 'The story is for ', h('strong', { 'data-testid': 'together-names' }, artNames(kids)), ` — ${kids.length === 2 ? 'both' : 'all their'} names, in the words and the pictures.`)
        : h('p', { class: 'field-hint' }, `Brothers and sisters can share a story: tick up to ${MAX_TOGETHER - 1} more.`),
    );
  }

  // ---- A message from whoever gave the book -------------------------------------------------
  const gift = profile.gift;
  let giftCard = null;
  if (gift && (gift.text || gift.recordingId || gift.from)) {
    const playBtn = gift.recordingId ? button({ text: 'Play the message', icon: 'play', variant: 'play-soft', size: 'md', testid: 'gift-play' }) : null;
    playBtn?.addEventListener('click', async () => playBlob(playBtn, await ctx.blobs.get(gift.recordingId).catch(() => null)));
    giftCard = h(
      'section',
      { class: 'card gift-message', 'data-testid': 'gift-card', 'aria-labelledby': 'gift-title' },
      h('span', { class: 'gift-message-art', 'aria-hidden': 'true' }, icon('gift', { size: 28 })),
      h('p', { class: 'eyebrow' }, `A message for ${profile.display}`),
      h('h2', { id: 'gift-title', 'data-testid': 'gift-from', tabindex: '-1' }, gift.from ? `From ${gift.from}` : 'With love'),
      gift.text ? h('blockquote', { class: 'gift-quote', 'data-testid': 'gift-text' }, gift.text) : null,
      playBtn,
    );
    addGiftPill(giftCard, gift.from);
  }

  // ---- Story time: who reads, bedtime ---------------------------------------------------------
  const readerOptions = [{ id: 'voice', title: 'The computer voice', meta: 'Says every name just the way you chose', icon: 'speaker', reading: null }, ...readings.map((r) => ({ id: r.id, title: r.readerName || 'A grown-up', meta: readingMeta(r, steps), icon: 'heart', reading: r }))];
  const chosen = reading?.id ?? 'voice';
  const whoReads = h(
    'fieldset',
    { class: 'who-reads', 'data-testid': 'who-reads' },
    h('legend', { class: 'field-label' }, 'Who reads the story?'),
    h('div', { class: 'reader-options' },
      readerOptions.map((o) => {
        const id = `reader-${o.id}`;
        const off = together && o.reading;
        const input = h('input', {
          type: 'radio',
          name: 'reader',
          id,
          value: o.id,
          class: 'reader-radio',
          'data-testid': 'reader-choice',
          'data-reader': o.id,
          checked: o.id === chosen,
          disabled: Boolean(off),
          onChange: () => {
            ctx.setState((s) => ({ ...s, activeReading: { ...(s.activeReading ?? {}), [bookId]: o.reading ? o.reading.id : null } }));
            repaint(`[data-testid=reader-choice][data-reader="${o.id}"]`);
          },
        });
        let sample = null;
        if (o.reading) {
          sample = button({ label: `Listen to ${o.title}`, icon: 'play', variant: 'play', size: 'sm', testid: 'reader-sample', class: 'reader-sample' });
          sample.addEventListener('click', async () => playBlob(sample, await firstPartBlob(o.reading)));
        }
        return h('div', { class: `reader-option${o.id === chosen ? ' is-on' : ''}${off ? ' is-off' : ''}` },
          input,
          h('label', { for: id, class: 'reader-label' },
            h('span', { class: `reader-icon${o.reading ? ' is-family' : ''}`, 'aria-hidden': 'true' }, icon(o.icon, { size: 20 })),
            h('span', { class: 'reader-text' }, h('strong', {}, o.reading ? readingLabel(o.reading) : o.title), h('span', {}, o.meta))),
          sample);
      })),
    together && readings.length ? h('p', { class: 'field-hint' }, `A recorded reading says one child’s name, so for ${who.display} the computer voice reads.`) : null,
    h('div', { class: 'who-reads-links' },
      linkButton({ text: readings.length ? 'Record another reading' : 'Record a reading in your voice', href: `#/b/${bookId}/record`, icon: 'mic', variant: 'link', size: 'sm', testid: 'go-record' }),
      linkButton({ text: 'Open a family recording', href: '#/open', icon: 'file', variant: 'link', size: 'sm', testid: 'open-pack' })),
  );
  const bedInput = h('input', {
    type: 'checkbox',
    role: 'switch',
    id: 'bedtime-toggle',
    class: 'switch-input',
    'data-testid': 'bedtime-toggle',
    checked: bedtime,
    onChange: (e) => {
      ctx.setState((s) => ({ ...s, settings: { ...s.settings, bedtime: e.target.checked } }));
      repaint('[data-testid=bedtime-toggle]');
    },
  });
  const bedToggle = h('label', { class: 'toggle bedtime-toggle', for: 'bedtime-toggle' },
    h('span', { class: 'bedtime-icon', 'aria-hidden': 'true' }, icon('moon', { size: 20 })),
    h('span', { class: 'toggle-text' }, h('strong', {}, 'Bedtime mode'), h('span', {}, 'A dim, calm screen; the story carries on by itself, page after page.')),
    bedInput,
    h('span', { class: 'switch', 'aria-hidden': 'true' }));
  const storyCard = h('section', { class: 'card story-card', 'aria-labelledby': 'story-time-title' }, h('h2', { id: 'story-time-title' }, 'Story time'), whoReads, bedToggle);

  // ---- Take it screen-free (Yoto / Tonie) -------------------------------------------------------
  let audioCard;
  if (reading) {
    const linkHost = h('div', { class: 'download-host', hidden: true });
    const progress = h('p', { class: 'field-hint', 'aria-live': 'polite', 'data-testid': 'save-audio-status' });
    const save = button({ text: 'Save as audio for Yoto / Tonie', icon: 'note', variant: 'secondary', size: 'md', testid: 'save-audio' });
    save.addEventListener('click', async () => {
      stopPlaying();
      setBusy(save, true);
      progress.textContent = 'Putting the pages together…';
      const out = await saveReadingAudio(ctx, book, reading, readingChildren(ctx.state)[0] ?? profile, { host: linkHost, onProgress: (f) => (progress.textContent = `Putting the pages together… ${Math.round(f * 100)}%`) });
      setBusy(save, false);
      progress.textContent = out.how === 'failed' ? '' : out.missing ? `Done. ${out.missing} part${out.missing === 1 ? ' was' : 's were'} missing, so ${out.missing === 1 ? 'it’s' : 'they’re'} not in the audio.` : 'Done — one file, with a soft chime at each page turn.';
    });
    audioCard = h('section', { class: 'card audio-card', 'aria-labelledby': 'audio-title' },
      h('h2', { id: 'audio-title' }, icon('note', { size: 22 }), h('span', {}, 'Take it screen-free')),
      h('p', {}, `Save ${reading.readerName ? `${reading.readerName}’s` : 'the'} reading as one audio file, with a soft chime at each page turn — for a Yoto card, a Toniebox or the car.`),
      save,
      progress,
      linkHost,
      yotoTip());
  } else {
    audioCard = h('section', { class: 'card audio-card is-muted', 'aria-labelledby': 'audio-title' },
      h('h2', { id: 'audio-title' }, icon('note', { size: 22 }), h('span', {}, 'Take it screen-free')),
      h('p', { 'data-testid': 'save-audio-note' }, 'The computer voice is made live, inside your browser, so it can’t be saved as a file. A reading recorded in a real voice can: save it for a Yoto card or a Creative-Tonie. (The full version will use a studio voice for this.)'),
      linkButton({ text: 'Record a reading', href: `#/b/${bookId}/record`, icon: 'mic', variant: 'link', size: 'sm' }));
  }

  // ---- Name stickers for the printed book (docs §12) ------------------------------------------------
  const stickersCard = h('section', { class: 'card give-card stickers-card', 'aria-labelledby': 'stickers-title' },
    h('span', { class: 'give-art is-stickers', 'aria-hidden': 'true' }, icon('sticker', { size: 26 })),
    h('div', {},
      h('h2', { id: 'stickers-title' }, 'Name stickers'),
      h('p', {}, `Print ${who.display}’s ${(who.count ?? 1) > 1 ? 'names' : 'name'} to stick on the stars in the real book — a screen-free way to see ${(who.count ?? 1) > 1 ? 'them' : 'it'} in the pictures.`),
      linkButton({ text: 'Print name stickers', href: `#/stickers/${bookId}`, icon: 'print', variant: 'link', size: 'sm', testid: 'go-stickers' })));

  // ---- Giving a book ------------------------------------------------------------------------------
  const giveCard = h('section', { class: 'card give-card', 'aria-labelledby': 'give-title' },
    h('span', { class: 'give-art', 'aria-hidden': 'true' }, icon('gift', { size: 26 })),
    h('div', {},
      h('h2', { id: 'give-title' }, 'Giving a book?'),
      h('p', {}, 'Set it up before you wrap it: their name, your message, even your voice reading every page.'),
      linkButton({ text: 'Set up a gift', href: `#/b/${bookId}/gift`, icon: 'gift', variant: 'link', size: 'sm', testid: 'go-gift' })));

  const tips = h(
    'section',
    { class: 'card tips', 'aria-labelledby': 'tips-title' },
    h('h2', { id: 'tips-title' }, 'How to read together'),
    h('ol', { class: 'tip-list' },
      tip('book', 'Sit together with the real book', 'Open it at the cover and prop your phone where you can both see it.'),
      tip('hand', 'Let little hands do the magic', 'When the story asks, your child can work the flap, wheel or slider on the book — or on the screen.'),
      tip('forward', 'Turn the pages together', `Turn the book’s page when the story does. Tap the arrow to move on — or switch on “turn pages automatically” in settings.`)),
  );

  const hero = h(
    'section',
    { class: 'ready-hero' },
    h('p', { class: 'eyebrow' }, bedtime ? 'Ready for bed' : 'All set'),
    h('h1', { class: 'ready-title', 'data-testid': 'ready-title' }, `${who.display}’s story is ready`),
    h('div', { class: 'ready-cover' }, cover.el),
    h('div', { class: 'ready-actions' }, pills, start, magicWrap),
  );

  const consent = voiceConsentCard(ctx, { signal, name: who.display });
  const { el } = screen(ctx, {
    name: 'ready',
    body: [
      envBanner({ signal }),
      hero,
      h('div', { class: 'ready-side' }, giftCard, consent, childCard, storyCard, audioCard, stickersCard, giveCard, tips, privacyLine('Everything stays on this phone. No account, no tracking.')),
    ],
  });
  el.classList.toggle('is-bedtime', bedtime);
  el.classList.toggle('no-enter', again);
  root.append(el);
  return () => {
    life.abort();
    stopPlaying();
    ctx.narrator.stop?.();
  };
}

function tip(ic, title, text) {
  return h('li', { class: 'tip' }, h('span', { class: 'tip-icon', 'aria-hidden': 'true' }, icon(ic, { size: 24 })), h('div', {}, h('strong', {}, title), h('p', {}, text)));
}

/** Direct use (not routed on its own; landing.js decides). */
export function render(root, ctx) {
  const profile = ctx.state.profiles.find((p) => p.id === ctx.state.activeProfileId);
  if (!profile) {
    ctx.navigate(`#/b/${ctx.bookId}`, { replace: true });
    return null;
  }
  return renderReady(root, ctx, profile);
}
