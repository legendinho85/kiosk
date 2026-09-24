// Loading and validating book packages (books/<id>/book.json). The format is
// documented in docs/architecture.md ("Book package format").

import { unknownPlaceholders } from './personalise.js';

export const MECHANIC_TYPES = ['none', 'slider', 'pull-tab', 'wheel', 'flap', 'push-button'];
// v1 board-book kinds, then v2 (KDP paperback) spread kinds.
export const PAGE_KINDS = ['cover', 'spread', 'end', 'title', 'magic', 'story', 'activity', 'back-matter'];
const DRIVE_KEYS = ['along', 'translate', 'rotate', 'scale', 'opacity', 'visible'];

const booksBase = new URL('../../books/', import.meta.url);

/** Resolve a path inside a book package to an absolute URL. */
export function bookUrl(bookId, path = '') {
  return new URL(`${encodeURIComponent(bookId)}/${path}`, booksBase).href;
}

export async function loadBookList() {
  const res = await fetch(new URL('index.json', booksBase));
  if (!res.ok) throw new Error(`Could not load the book list (${res.status})`);
  const data = await res.json();
  return data.books ?? [];
}

/** Fetch a book; throws with a readable message if it is missing or invalid. */
export async function loadBook(bookId) {
  if (!/^[a-z0-9-]+$/.test(String(bookId))) throw new Error('Unknown book');
  const res = await fetch(bookUrl(bookId, 'book.json'));
  if (!res.ok) throw new Error(res.status === 404 ? 'Unknown book' : `Could not load the book (${res.status})`);
  const book = await res.json();
  const errors = validateBook(book);
  if (errors.length) throw new Error(`This book file has problems:\n${errors.join('\n')}`);
  return book;
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isSel = (s) => typeof s === 'string' && /^#[A-Za-z][\w-]*$/.test(s);

/** Returns a list of human-readable problems (empty when valid). */
export function validateBook(book) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!book || typeof book !== 'object') return ['Book is not an object'];
  if (!book.id || !/^[a-z0-9-]+$/.test(book.id)) err('id must be kebab-case');
  if (!book.title) err('title is required');
  // Magic-window image tracking: only a book that declares its targets file is tracked.
  if (book.targets != null && typeof book.targets !== 'boolean' && !(typeof book.targets === 'string' && /\.mind$/.test(book.targets))) err('targets must be the path of a .mind file (or true for targets.mind)');
  if (!Array.isArray(book.pages) || book.pages.length === 0) return [...errors, 'pages must be a non-empty array'];

  const texts = (p) => [...(p.text ?? []), p.prompt ?? '', ...(p.after ?? []), p.alt ?? '', p.altAfter ?? '', book.title ?? '', book.subtitle ?? ''];
  book.pages.forEach((p, i) => {
    const at = `page ${p?.n ?? i + 1}`;
    if (!p || typeof p !== 'object') return err(`${at}: not an object`);
    if (p.n !== i + 1) err(`${at}: n should be ${i + 1}`);
    if (!PAGE_KINDS.includes(p.kind)) err(`${at}: kind must be one of ${PAGE_KINDS.join(', ')}`);
    if (!p.scene || typeof p.scene !== 'string') err(`${at}: scene (path to an SVG) is required`);
    if (!Array.isArray(p.text)) err(`${at}: text must be an array of lines`);
    if (p.after != null && !Array.isArray(p.after)) err(`${at}: after must be an array of lines`);
    // alt: what the picture shows, for screen readers (a template: {name} etc.); altAfter: once the mechanism is done.
    for (const k of ['alt', 'altAfter']) if (p[k] != null && typeof p[k] !== 'string') err(`${at}: ${k} must be a line of text`);
    if (p.print != null) {
      const pr = p.print;
      if (!Array.isArray(pr.pages) || pr.pages.length !== 2) err(`${at}: print.pages must be [left, right] (null for an unprinted half)`);
      if (pr.text != null && !Array.isArray(pr.text)) err(`${at}: print.text must be an array of lines`);
      for (const t of pr.text ?? []) if (/\{(name|NAME|Name|name's)\}/.test(t)) err(`${at}: printed text can't contain the child's name (use "you")`);
      for (const [j, b] of (pr.textBoxes ?? []).entries()) {
        if (!['left', 'right'].includes(b?.side) || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) err(`${at}: print.textBoxes[${j}] needs side left|right and x, y, w, h`);
      }
    }
    for (const t of texts(p)) for (const bad of unknownPlaceholders(t)) err(`${at}: unknown placeholder ${bad}`);

    const m = p.mechanic ?? { type: 'none' };
    if (!MECHANIC_TYPES.includes(m.type)) return err(`${at}: mechanic.type must be one of ${MECHANIC_TYPES.join(', ')}`);
    if (m.type === 'none') return;
    const c = m.control ?? {};
    if (m.type === 'slider' || m.type === 'pull-tab') {
      if (!isPoint(c.from) || !isPoint(c.to)) err(`${at}: ${m.type} control needs from [x,y] and to [x,y]`);
    } else if (m.type === 'wheel') {
      if (!isPoint(c.center) || !Number.isFinite(c.radius)) err(`${at}: wheel control needs center [x,y] and radius`);
    } else if (m.type === 'flap') {
      if (!isSel(c.flap)) err(`${at}: flap control needs flap "#id"`);
      if (!['top', 'bottom', 'left', 'right'].includes(c.hinge)) err(`${at}: flap hinge must be top|bottom|left|right`);
    } else if (m.type === 'push-button') {
      if (!isPoint(c.center) || !Number.isFinite(c.radius)) err(`${at}: push-button control needs center [x,y] and radius`);
    }
    if (c.knob != null && !isSel(c.knob)) err(`${at}: control.knob must be "#id"`);
    for (const [j, d] of (m.drives ?? []).entries()) {
      if (!isSel(d.target)) err(`${at}: drives[${j}].target must be "#id"`);
      const kinds = DRIVE_KEYS.filter((k) => k in d);
      if (kinds.length !== 1) err(`${at}: drives[${j}] needs exactly one of ${DRIVE_KEYS.join('/')}`);
      if (d.range && !(Array.isArray(d.range) && d.range.length === 2 && d.range[0] < d.range[1])) err(`${at}: drives[${j}].range must be [start, end] with start < end`);
      if ('along' in d && !isSel(d.along)) err(`${at}: drives[${j}].along must be "#pathId"`);
      if ('visible' in d && !(Array.isArray(d.visible) && d.visible.length === 2 && d.visible[0] < d.visible[1])) err(`${at}: drives[${j}].visible must be [from, to]`);
      if (d.phase != null && !['out', 'back'].includes(d.phase)) err(`${at}: drives[${j}].phase must be out|back`);
      if (d.phase && !c.returnTrip) err(`${at}: drives[${j}].phase needs control.returnTrip`);
    }
    for (const key of ['complete', 'midway']) {
      for (const s of [...(m[key]?.show ?? []), ...(m[key]?.hide ?? [])]) if (!isSel(s)) err(`${at}: ${key} show/hide entries must be "#id"`);
      for (const pair of m[key]?.addClass ?? []) if (!Array.isArray(pair) || !isSel(pair[0]) || typeof pair[1] !== 'string') err(`${at}: ${key}.addClass entries must be ["#id", "class"]`);
    }
    if (m.midway && !c.returnTrip) err(`${at}: midway needs control.returnTrip`);
  });
  return errors;
}
