// Grown-up screen helpers for the family features: handing a file to the
// parent (share sheet, download, or a plain link as the last resort), sending
// a recorded reading as a family pack, saving a reading as one audio file for
// a Yoto card or a Creative-Tonie, and playing a reading from settings.
//
// js/audio/mix.js (share/download, joining audio) and js/ar/qr.js (the
// landing URL) belong to other people and are loaded lazily; each has a
// fallback here so a missing module never stops a family sending a file.

import { h, icon, toast } from './ui.js';
import { buildPack, packFilename } from '../family/pack.js';
import { readingAudioParts, readingAudioFilename, readingShareText, storyTitle } from '../family/family.js';
import { fallbackLandingUrl } from './screens/qr.js';

const mixModule = () => import('../audio/mix.js').catch(() => null);

/** The URL printed in the book's QR code (the book's landing page). */
export async function landingUrl(bookId) {
  try {
    const m = await import('../ar/qr.js');
    if (typeof m.landingUrlFor === 'function') return m.landingUrlFor(bookId);
  } catch {
    /* use ours */
  }
  return fallbackLandingUrl(bookId);
}

/** The same URL as people read it ("example.com/?b=tiffin-football"). */
export function displayUrl(url) {
  return String(url ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** A plain download link: the last resort when neither sharing nor a scripted download works. */
export function downloadLink(blob, filename, { text = 'Download the file' } = {}) {
  let href = '';
  try {
    href = URL.createObjectURL(blob);
  } catch {
    return null;
  }
  return h('a', { class: 'btn btn-secondary btn-md download-link', href, download: filename, 'data-testid': 'download-link' }, icon('download', { size: 22 }), h('span', { class: 'btn-text' }, text));
}

/**
 * Hand a file to the grown-up: the phone's share sheet where it can share
 * files, else a download, else a visible download link in `host`.
 * @param {Blob} blob
 * @param {string} filename
 * @param {{title?: string, text?: string, host?: HTMLElement|null, linkText?: string}} [opts]
 * @returns {Promise<'shared'|'downloaded'|'cancelled'|'link'|'failed'>}
 */
export async function offerFile(blob, filename, { title = '', text = '', host = null, linkText } = {}) {
  const mix = await mixModule();
  if (mix?.shareOrDownload) {
    try {
      const how = await mix.shareOrDownload(blob, filename, { title, text });
      if (how !== 'cancelled' || !host) return how;
    } catch {
      /* fall through to the link */
    }
  }
  const link = downloadLink(blob, mix?.safeFilename ? mix.safeFilename(filename) : filename, { text: linkText });
  if (!link || !host) return 'failed';
  host.replaceChildren(link);
  host.hidden = false;
  return 'link';
}

/** A toast that says what just happened to the file. */
export function reportOffer(how, { sent = 'Sent!', saved = 'Saved to your downloads.' } = {}) {
  if (how === 'shared') toast(sent, { kind: 'success' });
  else if (how === 'downloaded') toast(saved, { kind: 'success', timeout: 7000 });
  else if (how === 'link') toast('Tap “Download the file” to save it.', { kind: 'info' });
  else if (how === 'failed') toast('Sorry — this browser couldn’t save the file.', { kind: 'error' });
}

/**
 * A reading's recorded parts as blobs, for a pack.
 * @returns {Promise<Record<string, {main: Blob|null, after: Blob|null}>>}
 */
export async function readingPartBlobs(reading, blobs) {
  const parts = {};
  for (const [n, p] of Object.entries(reading?.parts ?? {})) {
    const get = async (id) => {
      if (!id) return null;
      try {
        return (await blobs.get(id)) ?? null;
      } catch {
        return null;
      }
    };
    const main = await get(p?.main);
    const after = await get(p?.after);
    if (main || after) parts[n] = { main, after };
  }
  return parts;
}

/**
 * Build a reading pack for a stored reading.
 * @param {{blobs: object}} ctx
 * @param {object} reading
 * @param {{childName?: string}} [opts] who it was recorded for (shown when the family opens it)
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function readingPack(ctx, reading, { childName = '' } = {}) {
  const pack = {
    kind: 'reading',
    bookId: reading.bookId,
    createdAt: reading.packCreatedAt ?? reading.createdAt ?? Date.now(),
    readerName: reading.readerName ?? '',
    language: reading.language ?? '',
    parts: await readingPartBlobs(reading, ctx.blobs),
    child: childName ? { display: childName } : null,
  };
  return { blob: await buildPack(pack), filename: packFilename(pack) };
}

/**
 * "Send to family": build the pack and offer it.
 * @param {object} ctx screen context
 * @param {object} reading
 * @param {{book?: object|null, childName?: string, host?: HTMLElement|null, prebuilt?: Promise<{blob: Blob, filename: string}>|null}} [opts]
 */
export async function sendReading(ctx, reading, { book = null, childName = '', host = null, prebuilt = null } = {}) {
  let built;
  try {
    built = await (prebuilt ?? readingPack(ctx, reading, { childName }));
  } catch (err) {
    toast(err?.message || 'Sorry — we couldn’t put the recording together.', { kind: 'error' });
    return 'failed';
  }
  const url = await landingUrl(reading.bookId);
  const title = storyTitle(book, childName);
  const how = await offerFile(built.blob, built.filename, {
    title: `${reading.readerName || 'A family'} reading: ${title}`,
    text: readingShareText({ readerName: reading.readerName, title, landingUrl: url }),
    host,
  });
  reportOffer(how, { sent: 'Sent! They open it at the book’s page → “Open a family recording”.', saved: 'Saved to your downloads. Now send that file to the family (WhatsApp, email or AirDrop).' });
  return how;
}

/**
 * "Save as audio": join every recorded part in page order (a chime between
 * pages) into one WAV and offer it.
 * @param {object} ctx
 * @param {object} book
 * @param {object} reading
 * @param {{display: string}|null} person
 * @param {{host?: HTMLElement|null, onProgress?: (f: number) => void}} [opts]
 * @returns {Promise<{how: string, blob?: Blob, missing?: number}>}
 */
export async function saveReadingAudio(ctx, book, reading, person, { host = null, onProgress } = {}) {
  const mix = await mixModule();
  if (!mix?.concatToWav) {
    toast('Saving audio isn’t available in this browser yet.', { kind: 'error' });
    return { how: 'failed' };
  }
  const { parts, clips, missing } = await readingAudioParts(book, reading, (id) => ctx.blobs.get(id));
  if (!clips) {
    toast('There’s nothing recorded to save yet.', { kind: 'info' });
    return { how: 'failed' };
  }
  let wav;
  try {
    wav = await mix.concatToWav(parts, { sampleRate: 22050, onProgress });
  } catch (err) {
    toast(err?.message || 'Sorry — we couldn’t join the recordings.', { kind: 'error' });
    return { how: 'failed' };
  }
  const filename = readingAudioFilename(book, person, reading);
  const how = await offerFile(wav, filename, { title: filename.replace(/\.wav$/, '').replace(/-/g, ' '), host, linkText: 'Download the audio' });
  reportOffer(how, { sent: 'Shared!', saved: 'Saved to your downloads — ready for the Yoto or Tonies app.' });
  return { how, blob: wav, missing };
}

/** One line on loading the file onto a Yoto card or a Creative-Tonie. */
export function yotoTip() {
  return h(
    'p',
    { class: 'yoto-tip' },
    icon('info', { size: 18 }),
    h('span', {}, h('strong', {}, 'Yoto: '), 'in the Yoto app, make a new ‘Make Your Own’ card and add the file. ', h('strong', {}, 'Toniebox: '), 'in the Tonies app, upload it to a Creative-Tonie.'),
  );
}

/**
 * Play a whole reading, part after part, until the signal aborts.
 * @returns {Promise<void>}
 */
export async function playReading(ctx, reading, { signal } = {}) {
  let rec;
  try {
    rec = await import('../audio/recorder.js');
  } catch {
    return;
  }
  const pages = Object.keys(reading?.parts ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  for (const n of pages) {
    for (const part of ['main', 'after']) {
      if (signal?.aborted) return;
      const id = reading?.parts?.[n]?.[part];
      if (!id) continue;
      const blob = await ctx.blobs.get(id).catch(() => null);
      if (!blob) continue;
      try {
        await rec.playBlob(blob, { signal });
      } catch {
        /* skip a part that won't play */
      }
    }
  }
}
