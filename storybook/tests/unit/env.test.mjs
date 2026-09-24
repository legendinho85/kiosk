// detectEnvironment() with real-world user-agent strings (as sent by the
// apps and browsers in 2024-26) and fake window objects.

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEnvironment, detectInApp, detectOs, hintFor } from '../../js/core/env.js';

const UA = {
  // Normal browsers
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
  firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  samsungInternet: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.67',
  iosHomeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  // In-app browsers
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 348.0.0.40.109 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; en_GB; 640107219)',
  instagramIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 346.0.2.24.108 (iPhone15,3; iOS 17_6_1; en_GB; en-GB; scale=3.00; 1290x2796; 631281934; IABMV/1)',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/478.0.0.41.86;]',
  facebookIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/475.0.0.34.109;FBBV/640307432;FBDV/iPhone14,7;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5;FBRV/642226245;IABMV/1]',
  facebookIpad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/475.0.0.34.109;FBBV/640307432;FBDV/iPad13,18;FBMD/iPad;FBSN/iPadOS;FBSV/17.5;FBSS/2;FBID/tablet;FBLC/en_GB;FBOP/5]',
  messengerAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.99 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/471.0.0.38.109;]',
  messengerIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LightSpeed [FBAN/MessengerLiteForiOS;FBAV/470.0.0.28.107;FBBV/634375453;FBDV/iPhone13,2;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBCR/;FBID/phone;FBLC/en_GB;FBOP/0]',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 trill_350503 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/35.5.3 ByteLocale/en ByteFullLocale/en Region/GB AppId/1233 Spark/1.5.8.4-bugfix AppVersion/35.5.3 BytedanceWebview/d8a21c6',
  tiktokIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.9.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/GB isDarkMode/0 WKWebView/1 RevealType/Dialog BytedanceWebview/d8a21c6 FalconTag/',
  snapchatIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.3.0.44 (like Safari/8618.2.12.10.4, panda)',
  snapchatAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Snapchat/13.5.0.46 (like Chrome/127.0.6533.103)',
  linkedinIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1210',
  linkedinAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 [LinkedInApp]/4.1.975',
  threadsIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 339.0.0.26.84 (iPhone14,7; iOS 17_5_1; en_GB; en-GB; scale=3.00; 1170x2532; 618307530; IABMV/1)',
  gsaIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.665236494 Mobile/15E148 Safari/604.1',
  gsaAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 GSA/15.32.36.28.arm64',
  wechatIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003137) NetType/WIFI Language/en',
  pinterestAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [Pinterest/Android]',
  genericWebView: 'Mozilla/5.0 (Linux; Android 11; moto g(30) Build/RRMS31.Q1-10-65-3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36',
  unknownIosWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

/** A window with the features a modern browser has; pass overrides to take things away. */
function fakeWindow({ speech = true, recognition = true, secure = true, standalone = false, policy = null } = {}) {
  class Utt {}
  return {
    isSecureContext: secure,
    speechSynthesis: speech ? { speak() {}, getVoices: () => [] } : undefined,
    SpeechSynthesisUtterance: speech ? Utt : undefined,
    webkitSpeechRecognition: recognition ? class {} : undefined,
    matchMedia: (q) => ({ matches: standalone && /standalone/.test(q) }),
    document: policy ? { permissionsPolicy: { allowsFeature: (f) => policy[f] !== false } } : {},
  };
}
const fakeNav = (userAgent, extra = {}) => ({ userAgent, maxTouchPoints: /iPhone|iPad|Android/.test(userAgent) ? 5 : 0, mediaDevices: { getUserMedia() {} }, ...extra });
const env = (ua, win = {}, nav = {}) => detectEnvironment(fakeNav(ua, nav), fakeWindow(win));

test('ordinary browsers: everything available, no hint', () => {
  for (const [key, os] of [
    ['safariIphone', 'ios'],
    ['chromeIphone', 'ios'],
    ['firefoxIphone', 'ios'],
    ['chromeAndroid', 'android'],
    ['samsungInternet', 'android'],
    ['firefoxAndroid', 'android'],
    ['edgeWindows', 'other'],
    ['macSafari', 'other'],
  ]) {
    const e = env(UA[key]);
    assert.equal(e.inAppBrowser, null, key);
    assert.equal(e.os, os, key);
    assert.equal(e.speech, true, key);
    assert.equal(e.recognition, true, key);
    assert.equal(e.camera, true, key);
    assert.equal(e.openInBrowserHint, null, key);
    assert.equal(e.appName, null, key);
  }
});

test('iPadOS in desktop mode is iOS (touch points give it away); a Mac is not', () => {
  assert.equal(env(UA.ipadDesktop, {}, { maxTouchPoints: 5 }).os, 'ios');
  assert.equal(env(UA.macSafari, {}, { maxTouchPoints: 0 }).os, 'other');
  assert.equal(detectOs('Mozilla/5.0 (Linux; Android 14)', {}), 'android');
  assert.equal(detectOs('', { userAgentData: { platform: 'Android' } }), 'android');
});

test('Android in-app browsers are WebViews: no speech, and the hint says how to get out', () => {
  const cases = [
    ['instagramAndroid', 'instagram', 'Instagram'],
    ['facebookAndroid', 'facebook', 'Facebook'],
    ['messengerAndroid', 'facebook', 'Messenger'],
    ['tiktokAndroid', 'tiktok', 'TikTok'],
    ['snapchatAndroid', 'snapchat', 'Snapchat'],
    ['linkedinAndroid', 'linkedin', 'LinkedIn'],
    ['gsaAndroid', 'other', 'the Google app'],
    ['pinterestAndroid', 'other', 'Pinterest'],
  ];
  for (const [key, id, name] of cases) {
    const e = env(UA[key]);
    assert.equal(e.inAppBrowser, id, key);
    assert.equal(e.appName, name, key);
    assert.equal(e.os, 'android', key);
    assert.equal(e.speech, false, `${key}: WebViews can't speak even though the object exists`);
    assert.equal(e.recognition, false, key);
    assert.equal(e.camera, false, key);
    assert.match(e.openInBrowserHint, new RegExp(`^This page opened inside ${name}, which can’t read the story aloud\\. Tap [⋮⋯] and choose ‘Open in browser’\\.$`), key);
  }
  assert.match(env(UA.instagramAndroid).openInBrowserHint, /Tap ⋮/, 'Android menus are ⋮');
  assert.match(env(UA.tiktokAndroid).openInBrowserHint, /Tap ⋯/, 'TikTok uses ⋯ everywhere');
});

test('an unnamed Android WebView ("; wv)") gets the generic advice', () => {
  const e = env(UA.genericWebView);
  assert.equal(e.inAppBrowser, 'android-webview');
  assert.equal(e.appName, null);
  assert.equal(e.speech, false);
  assert.equal(e.openInBrowserHint, 'This page opened inside another app, which can’t read the story aloud. Look for ‘Open in browser’ in the app’s ⋮ menu, or copy the link into Chrome.');
});

test('iPhone in-app browsers can speak, but not record or use the camera; they may forget the name', () => {
  const cases = [
    ['instagramIphone', 'instagram', 'Instagram'],
    ['facebookIphone', 'facebook', 'Facebook'],
    ['facebookIpad', 'facebook', 'Facebook'],
    ['messengerIphone', 'facebook', 'Messenger'],
    ['tiktokIphone', 'tiktok', 'TikTok'],
    ['snapchatIphone', 'snapchat', 'Snapchat'],
    ['linkedinIphone', 'linkedin', 'LinkedIn'],
    ['threadsIphone', 'other', 'Threads'],
    ['gsaIphone', 'other', 'the Google app'],
    ['wechatIphone', 'other', 'WeChat'],
  ];
  for (const [key, id, name] of cases) {
    const e = env(UA[key]);
    assert.equal(e.inAppBrowser, id, key);
    assert.equal(e.appName, name, key);
    assert.equal(e.os, 'ios', key);
    assert.equal(e.speech, true, key);
    assert.equal(e.recognition, false, key);
    assert.equal(e.camera, false, key);
    assert.equal(e.openInBrowserHint, `This page opened inside ${name}, which may forget your child’s name and can’t use the microphone or camera. Tap ⋯ and choose ‘Open in browser’.`, key);
  }
});

test('an iPhone web view in an unknown app is spotted, but the home-screen web app is not mistaken for one', () => {
  const inApp = env(UA.unknownIosWebView);
  assert.equal(inApp.inAppBrowser, 'other');
  assert.equal(inApp.appName, null);
  assert.match(inApp.openInBrowserHint, /^This page opened inside another app, .* copy the link into Safari\.$/);
  const home = env(UA.iosHomeScreen, { standalone: true });
  assert.equal(home.inAppBrowser, null);
  assert.equal(home.standalone, true);
  assert.equal(home.openInBrowserHint, null);
  // Older iOS reports home-screen mode through navigator.standalone instead.
  assert.equal(detectEnvironment(fakeNav(UA.iosHomeScreen, { standalone: true }), fakeWindow()).inAppBrowser, null);
});

test('Messenger and Threads are not mistaken for Facebook and Instagram, and vice versa', () => {
  assert.equal(detectInApp(UA.messengerIphone).name, 'Messenger');
  assert.equal(detectInApp(UA.facebookIphone).name, 'Facebook');
  assert.equal(detectInApp(UA.threadsIphone).name, 'Threads');
  assert.equal(detectInApp(UA.instagramIphone).name, 'Instagram');
  assert.equal(detectInApp(UA.safariIphone).id, null);
  assert.equal(detectInApp(UA.chromeAndroid).id, null);
});

test('no speech engine in an ordinary browser: a gentle hint to try another browser', () => {
  const e = env(UA.firefoxAndroid, { speech: false });
  assert.equal(e.speech, false);
  assert.equal(e.inAppBrowser, null);
  assert.equal(e.openInBrowserHint, 'This browser can’t read aloud, so the words will light up without a voice. For the voice, open this page in Chrome.');
  assert.match(env(UA.edgeWindows, { speech: false }).openInBrowserHint, /Chrome, Edge or Safari\.$/);
});

test('insecure pages and sandboxed frames: no microphone or camera (and no hint, it isn’t an app)', () => {
  const http = env(UA.chromeAndroid, { secure: false });
  assert.equal(http.camera, false);
  assert.equal(http.recognition, false);
  assert.equal(http.speech, true);
  const framed = env(UA.edgeWindows, { policy: { camera: false, microphone: false } });
  assert.equal(framed.camera, false);
  assert.equal(framed.recognition, false);
  assert.equal(framed.openInBrowserHint, null);
  const noMedia = detectEnvironment({ userAgent: UA.safariIphone, maxTouchPoints: 5 }, fakeWindow({ recognition: false }));
  assert.equal(noMedia.camera, false);
  assert.equal(noMedia.recognition, false);
});

test('never throws: missing or hostile navigator/window', () => {
  assert.doesNotThrow(() => detectEnvironment(undefined, undefined));
  const bare = detectEnvironment({}, {});
  assert.deepEqual(
    { speech: bare.speech, recognition: bare.recognition, camera: bare.camera, inAppBrowser: bare.inAppBrowser, os: bare.os },
    { speech: false, recognition: false, camera: false, inAppBrowser: null, os: 'other' },
  );
  const hostile = new Proxy({}, { get() { throw new Error('nope'); } });
  const e = detectEnvironment(hostile, hostile);
  assert.equal(e.os, 'other');
  assert.equal(e.speech, false);
  assert.equal(typeof e.openInBrowserHint, 'string');
});

test('works in node with the real globals (no window)', () => {
  const e = detectEnvironment();
  assert.equal(typeof e.speech, 'boolean');
  assert.ok(['ios', 'android', 'other'].includes(e.os));
});

test('hintFor is plain text in UK English with curly quotes', () => {
  const h = hintFor({ speech: false, inAppBrowser: 'instagram', appName: 'Instagram', os: 'android' });
  assert.equal(h, 'This page opened inside Instagram, which can’t read the story aloud. Tap ⋮ and choose ‘Open in browser’.');
  assert.equal(hintFor({ speech: true, inAppBrowser: null, appName: null, os: 'ios' }), null);
  assert.ok(!/[<>]/.test(h));
});
