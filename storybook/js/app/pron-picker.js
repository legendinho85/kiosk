// A compact "how do you say it?" picker for the gift screen: the same
// candidates as the full pronunciation screen (dictionary first, as written,
// suggestions) as a small radio list with play buttons, plus "type how it
// sounds". The full screen (js/app/screens/pronunciation.js) stays the place
// for recording and "say it".

import { h, icon, button, respellNode, debounce } from './ui.js';
import { getCandidates, customCandidate } from '../pronounce/index.js';
import { candidateTitle, storedPronunciation, mergeCandidates, findSaved } from './screens/pronunciation.js';

let seq = 0;

/**
 * @param {{narrator: object, lexicon: object|null}} ctx
 * @param {{onChange?: (pronunciation: object|null) => void, signal?: AbortSignal}} [opts]
 * @returns {{el: HTMLElement, setName(display: string, saved?: object|null): void, value(): object|null, stop(): void, flush(): void}}
 */
export function createPronunciationPicker(ctx, { onChange, signal } = {}) {
  const uid = `pp${++seq}`;
  let display = '';
  let candidates = [];
  let selected = null;
  let playing = null;

  const list = h('div', { class: 'pp-list', role: 'radiogroup', 'aria-label': 'How do you say it?' });
  const customInput = h('input', { id: `${uid}-custom`, class: 'text-input pp-custom-input', type: 'text', 'data-testid': 'pp-custom', maxlength: '60', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'e.g. shih-VAWN' });
  const customAdd = button({ text: 'Add', icon: 'plus', variant: 'secondary', size: 'sm', testid: 'pp-custom-add' });
  const custom = h('details', { class: 'pp-custom' },
    h('summary', {}, 'None of these? Type how it sounds'),
    h('div', { class: 'pp-custom-row' }, h('label', { class: 'sr-only', for: `${uid}-custom` }, 'Type how it sounds'), customInput, customAdd),
    h('p', { class: 'field-hint' }, 'Use hyphens and CAPITALS for the loud part, like shih-VAWN.'));
  const el = h('div', { class: 'pp', hidden: true, 'data-testid': 'pp' }, h('p', { class: 'field-label pp-label' }, 'How do you say it?'), list, custom);

  function stop() {
    playing?.abort();
    playing = null;
    for (const b of list.querySelectorAll('.is-playing')) b.classList.remove('is-playing');
    try {
      ctx.narrator?.stop?.();
    } catch {
      /* ignore */
    }
  }
  signal?.addEventListener('abort', stop, { once: true });

  async function play(btn, say) {
    const mine = btn.classList.contains('is-playing');
    stop();
    if (mine) return;
    playing = new AbortController();
    const my = playing;
    btn.classList.add('is-playing');
    try {
      await ctx.narrator?.speakText?.(say, { signal: my.signal });
    } catch {
      /* no voice: fine */
    } finally {
      btn.classList.remove('is-playing');
      if (playing === my) playing = null;
    }
  }

  function render() {
    list.replaceChildren(
      ...candidates.map((c, i) => {
        const id = `${uid}-c${i}`;
        const on = selected === c;
        const radio = h('input', { type: 'radio', name: `${uid}-say`, id, class: 'pp-radio', checked: on, 'data-testid': 'pp-choice', 'data-say': c.say, onChange: () => choose(c) });
        const sound = c.respell ? respellNode(c.respell) : h('span', {}, `“${c.say}”`);
        const playBtn = button({ label: `Listen: ${candidateTitle(c)}`, icon: 'play', variant: 'play', size: 'sm', testid: 'pp-play', class: 'pp-play' });
        playBtn.addEventListener('click', () => play(playBtn, c.say));
        return h('div', { class: `pp-option${on ? ' is-on' : ''}` }, playBtn, radio, h('label', { for: id, class: 'pp-text' }, h('span', { class: 'pp-sound' }, sound), h('span', { class: 'pp-title' }, candidateTitle(c))), on ? h('span', { class: 'pp-tick', 'aria-hidden': 'true' }, icon('check', { size: 16 })) : null);
      }),
    );
  }

  function choose(c) {
    selected = c;
    render();
    onChange?.(value());
  }

  function value() {
    return selected ? storedPronunciation(selected) : null;
  }

  const addCustom = () => {
    const c = customCandidate(customInput.value, 'custom');
    if (!c) return;
    const { list: next } = mergeCandidates(candidates.filter((x) => x.source !== 'custom'), [{ ...c, id: 'custom' }]);
    candidates = next;
    selected = candidates[findSaved(candidates, c)] ?? selected;
    render();
    onChange?.(value());
  };
  customAdd.addEventListener('click', addCustom);
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  });

  const refresh = debounce((saved) => {
    candidates = display ? getCandidates(ctx.lexicon, display, { max: 3 }) : [];
    if (saved?.say && findSaved(candidates, saved) < 0) candidates = mergeCandidates(candidates, [{ id: 'saved', say: saved.say, ipa: saved.ipa ?? '', respell: saved.respell ?? '', label: saved.label ?? '', source: saved.source === 'dictionary' ? 'dictionary' : 'custom' }]).list;
    const i = saved?.say ? findSaved(candidates, saved) : -1;
    selected = candidates[i >= 0 ? i : 0] ?? null;
    el.hidden = !candidates.length;
    render();
    onChange?.(value());
  }, 200);

  return {
    el,
    setName(next, saved = null) {
      const d = String(next ?? '');
      if (d === display && !saved) return;
      display = d;
      stop();
      refresh(saved);
    },
    value,
    stop,
    /** Apply a pending name change now (before reading value()). */
    flush: () => refresh.flush(),
  };
}
