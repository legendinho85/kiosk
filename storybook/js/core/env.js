// What this browser can do for the read-along, and whether the page has been
// opened somewhere that will let the family down.
//
// Most parents arrive by scanning the QR code with the camera app (which opens
// the real browser), but links shared on WhatsApp, Instagram, Facebook or
// TikTok open inside that app's own "in-app browser". Those are cut-down
// browsers: on Android they are WebViews, which can't speak at all; on iPhone
// they can speak but usually can't use the microphone or camera, and often
// forget what was stored (the child's name) when the app closes. The fix is a
// single tap on the app's menu, so we tell the grown-up exactly that.
//
// Pure apart from reading `navigator`/`window`, which can be passed in (tests
// use real user-agent strings). Never throws.

/**
 * @typedef {null|'android-webview'|'facebook'|'instagram'|'tiktok'|'snapchat'|'linkedin'|'other'} InAppBrowser
 * @typedef {{
 *   speech: boolean,          // speechSynthesis can read aloud here
 *   recognition: boolean,     // "say it" speech recognition can be offered
 *   camera: boolean,          // the magic window can ask for the camera
 *   inAppBrowser: InAppBrowser,
 *   os: 'ios'|'android'|'other',
 *   openInBrowserHint: string|null, // parent-friendly advice, or null when all is well
 *   appName: string|null,     // "Instagram", "the Google app"… (null in a normal browser)
 *   standalone: boolean,      // running from the home screen (installed web app)
 * }} Environment
 */

// Apps with their own entry in the contract. Order matters: Threads and
// Messenger are checked before Instagram and Facebook.
const NAMED_APPS = [
  { id: 'other', name: 'Threads', re: /\bBarcelona\s\d/ },
  { id: 'instagram', name: 'Instagram', re: /\bInstagram\b/ },
  { id: 'facebook', name: 'Messenger', re: /MessengerForiOS|MessengerLite|FB_IAB\/(?:Orca-Android|MESSENGER)/ },
  { id: 'facebook', name: 'Facebook', re: /FBAN\/|FBAV\/|FB_IAB\/|FBIOS|FB4A|\[FB/ },
  { id: 'tiktok', name: 'TikTok', re: /musical_ly|BytedanceWebview|\bTikTok\b|\btrill_\d|\bAppName\/(?:musical_ly|trill)/i },
  { id: 'snapchat', name: 'Snapchat', re: /\bSnapchat\b/i },
  { id: 'linkedin', name: 'LinkedIn', re: /LinkedInApp/i },
];

// Other in-app browsers we can recognise by name.
const OTHER_APPS = [
  { name: 'the Google app', re: /\bGSA\/\d/ },
  { name: 'X', re: /TwitterAndroid|Twitter for (?:iPhone|iPad)/ },
  { name: 'Pinterest', re: /\[?Pinterest\/(?:Android|iOS)|Pinterest for (?:iOS|Android)/i },
  { name: 'WeChat', re: /MicroMessenger/i },
  { name: 'LINE', re: /\bLine\/\d/ },
  { name: 'KakaoTalk', re: /KAKAOTALK/i },
  { name: 'Naver', re: /NAVER\(inapp/i },
  { name: 'Telegram', re: /\bTelegram(?:-Android)?\/\d|TelegramBot/i },
  { name: 'Discord', re: /\bDiscord\/\d/i },
  { name: 'WhatsApp', re: /\bWhatsApp\/\d/i },
  { name: 'Outlook', re: /\bOutlook-(?:iOS|Android)\//i },
];

// iOS browsers other than Safari still say "Safari/" in their user agent, and
// app web views don't; these tokens mark real browsers either way.
const IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave|Focus|Coast|GSA\//;

function safely(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

/** 'ios' | 'android' | 'other'. iPadOS pretends to be a Mac, but has touch points. */
export function detectOs(ua, nav) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && Number(safely(() => nav?.maxTouchPoints, 0)) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (safely(() => nav?.userAgentData?.platform, '') === 'Android') return 'android';
  return 'other';
}

/**
 * Which in-app browser (if any) the user agent belongs to.
 * @param {string} ua
 * @param {{os?: string, standalone?: boolean}} [opts]
 * @returns {{id: InAppBrowser, name: string|null, webview: boolean}}
 */
export function detectInApp(ua, { os = detectOs(ua), standalone = false } = {}) {
  const s = String(ua ?? '');
  const webview = os === 'android' && /;\s*wv\)/.test(s);
  for (const app of NAMED_APPS) if (app.re.test(s)) return { id: app.id, name: app.name, webview };
  for (const app of OTHER_APPS) if (app.re.test(s)) return { id: 'other', name: app.name, webview };
  if (webview) return { id: 'android-webview', name: null, webview: true };
  // An iPhone web view in some other app: no "Safari/" and no browser name. The
  // home-screen web app looks the same, so that is ruled out first.
  if (os === 'ios' && !standalone && /AppleWebKit/.test(s) && !/Safari\//.test(s) && !IOS_BROWSERS.test(s)) {
    return { id: 'other', name: null, webview: true };
  }
  return { id: null, name: null, webview: false };
}

// The menu button in-app browsers put the "Open in browser" item behind.
const MENU = { ios: '⋯', android: '⋮', other: '⋯' };
const MENU_BY_APP = { TikTok: '⋯' };

/**
 * Parent-friendly advice for the environment, or null when all is well.
 * @param {{speech: boolean, inAppBrowser: InAppBrowser, appName: string|null, os: string}} env
 */
export function hintFor({ speech, inAppBrowser, appName, os }) {
  const browser = os === 'ios' ? 'Safari' : os === 'android' ? 'Chrome' : 'Chrome, Edge or Safari';
  const menu = MENU_BY_APP[appName] ?? MENU[os] ?? MENU.other;
  if (inAppBrowser) {
    const where = appName ? `inside ${appName}` : 'inside another app';
    const how = appName
      ? `Tap ${menu} and choose ‘Open in browser’.`
      : `Look for ‘Open in browser’ in the app’s ${menu} menu, or copy the link into ${browser}.`;
    if (!speech) return `This page opened ${where}, which can’t read the story aloud. ${how}`;
    return `This page opened ${where}, which may forget your child’s name and can’t use the microphone or camera. ${how}`;
  }
  if (!speech) return `This browser can’t read aloud, so the words will light up without a voice. For the voice, open this page in ${browser}.`;
  return null;
}

/** Is a powerful feature allowed in this frame? (sandboxed iframes and embeds often say no) */
function allowedByPolicy(win, feature) {
  const policy = safely(() => win?.document?.permissionsPolicy ?? win?.document?.featurePolicy, null);
  if (!policy || typeof policy.allowsFeature !== 'function') return true;
  return safely(() => policy.allowsFeature(feature), true) !== false;
}

/**
 * Detect what the read-along can do here.
 * @param {Navigator|object} [nav]
 * @param {Window|object} [win]
 * @returns {Environment}
 */
export function detectEnvironment(nav = globalThis.navigator, win = globalThis.window ?? globalThis) {
  const ua = String(safely(() => nav?.userAgent, '') ?? '');
  const os = detectOs(ua, nav);
  const standalone =
    safely(() => nav?.standalone, false) === true ||
    safely(() => Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches), false) === true;
  const app = detectInApp(ua, { os, standalone });
  const secure = safely(() => win?.isSecureContext, true) !== false;

  const hasSynth = safely(() => Boolean(win?.speechSynthesis && typeof win.speechSynthesis.speak === 'function' && typeof win.SpeechSynthesisUtterance === 'function'), false);
  // Android WebViews (every Android in-app browser) have no text-to-speech,
  // even where the object exists.
  const speech = hasSynth && !(os === 'android' && app.webview);

  const hasRecognition = safely(() => typeof (win?.SpeechRecognition ?? win?.webkitSpeechRecognition) === 'function', false);
  const recognition = hasRecognition && secure && !app.id && allowedByPolicy(win, 'microphone');

  const hasCamera = safely(() => typeof nav?.mediaDevices?.getUserMedia === 'function', false);
  const camera = hasCamera && secure && !app.id && allowedByPolicy(win, 'camera');

  const env = { speech, recognition, camera, inAppBrowser: app.id, os, openInBrowserHint: null, appName: app.name, standalone };
  env.openInBrowserHint = hintFor(env);
  return env;
}
