import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCameraSupported, cameraErrorKind, orientationOf, fitSize, normaliseAlign, alignTransform, dragAlign, pinchAlign, nudgeAlign,
  readAlignStore, writeAlignStore, coverFit, projectMarkerPoint, trackedQuad, rectToQuadMatrix, applyMatrix3d, matrix3dCss,
  DEFAULT_ALIGN, ALIGN_LIMITS, CAMERA_CONSTRAINTS, MINDAR_URL, MINDAR_BASE, MINDAR_FILES, rewriteImports, targetsPath, loadMindAr,
} from '../../js/ar/magic-window.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≈ ${b}`);
const closePt = (p, q, eps = 1e-6) => {
  close(p[0], q[0], eps, 'x');
  close(p[1], q[1], eps, 'y');
};

test('isCameraSupported needs getUserMedia and a secure context', () => {
  const md = { getUserMedia() {} };
  assert.equal(isCameraSupported({ navigator: { mediaDevices: md }, isSecureContext: true }), true);
  assert.equal(isCameraSupported({ navigator: { mediaDevices: md } }), true, 'older engines without isSecureContext');
  assert.equal(isCameraSupported({ navigator: { mediaDevices: md }, isSecureContext: false }), false, 'plain http on a LAN address');
  assert.equal(isCameraSupported({ navigator: {} }), false);
  assert.equal(isCameraSupported({}), false);
  assert.equal(isCameraSupported(null), false);
  // A getter that throws (locked-down webviews) is "no".
  assert.equal(isCameraSupported({ get navigator() { throw new Error('nope'); } }), false);
});

test('the camera constraints ask for the rear camera at 1280x720, no audio', () => {
  assert.deepEqual(CAMERA_CONSTRAINTS, { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  assert.match(MINDAR_URL, /^https:\/\/cdn\.jsdelivr\.net\/npm\/mind-ar@1\.2\.5\//);
});

test('cameraErrorKind sorts getUserMedia failures into parent-friendly cases', () => {
  const e = (name) => ({ name });
  assert.equal(cameraErrorKind(e('NotAllowedError')), 'denied');
  assert.equal(cameraErrorKind(e('PermissionDeniedError')), 'denied');
  assert.equal(cameraErrorKind(e('SecurityError')), 'denied');
  assert.equal(cameraErrorKind(e('NotFoundError')), 'nocamera');
  assert.equal(cameraErrorKind(e('OverconstrainedError')), 'nocamera');
  assert.equal(cameraErrorKind(e('NotReadableError')), 'busy');
  assert.equal(cameraErrorKind(e('AbortError')), 'busy');
  assert.equal(cameraErrorKind(e('NotSupportedError')), 'unsupported');
  assert.equal(cameraErrorKind(new TypeError('x')), 'unsupported');
  assert.equal(cameraErrorKind(e('Weird')), 'error');
  assert.equal(cameraErrorKind(undefined), 'error');
});

test('orientationOf and fitSize', () => {
  assert.equal(orientationOf(390, 844), 'portrait');
  assert.equal(orientationOf(844, 390), 'landscape');
  assert.equal(orientationOf(500, 500), 'landscape');
  // Portrait phone: the 16:10 page is as wide as allowed.
  const p = fitSize(390, 844, { fill: 1 });
  assert.deepEqual(p, { width: 390, height: 243.75 });
  // Landscape phone: limited by the height.
  const l = fitSize(844, 390, { fill: 0.9 });
  close(l.height, 351);
  close(l.width, 351 * 1.6);
  assert.deepEqual(fitSize(0, 500), { width: 0, height: 0 });
  assert.deepEqual(fitSize(-5, 500), { width: 0, height: 0 });
});

test('normaliseAlign clamps, fills defaults and survives junk', () => {
  assert.deepEqual(normaliseAlign(undefined), { ...DEFAULT_ALIGN });
  assert.deepEqual(normaliseAlign({ x: 'a', y: null, scale: NaN, rotate: {} }), { ...DEFAULT_ALIGN });
  const big = normaliseAlign({ x: 9, y: -9, scale: 99, rotate: 400 });
  assert.deepEqual(big, { x: ALIGN_LIMITS.maxShift, y: -ALIGN_LIMITS.maxShift, scale: ALIGN_LIMITS.maxScale, rotate: ALIGN_LIMITS.maxRotate });
  assert.equal(normaliseAlign({ scale: 0 }).scale, ALIGN_LIMITS.minScale);
  assert.deepEqual(normaliseAlign({ x: '0.25', y: -0.1, scale: '1.5', rotate: -3 }), { x: 0.25, y: -0.1, scale: 1.5, rotate: -3 });
});

test('alignTransform: centred, then moved in px, turned and scaled', () => {
  assert.equal(alignTransform(DEFAULT_ALIGN, { width: 390, height: 844 }), 'translate(-50%, -50%) translate(0px, 0px) rotate(0deg) scale(1)');
  assert.equal(alignTransform({ x: 0.1, y: -0.05, scale: 1.25, rotate: 2.5 }, { width: 400, height: 800 }), 'translate(-50%, -50%) translate(40px, -40px) rotate(2.5deg) scale(1.25)');
});

test('dragAlign moves by fractions of the stage', () => {
  const a = dragAlign({ x: 0, y: 0, scale: 1.2, rotate: 1 }, 39, -84.4, { width: 390, height: 844 });
  close(a.x, 0.1);
  close(a.y, -0.1);
  assert.equal(a.scale, 1.2);
  assert.equal(a.rotate, 1);
  // Clamped so the page can't be flung off screen.
  assert.equal(dragAlign(DEFAULT_ALIGN, 10000, 0, { width: 390, height: 844 }).x, ALIGN_LIMITS.maxShift);
});

test('pinchAlign: spread to scale, twist to turn, move with the midpoint', () => {
  const stage = { width: 400, height: 800 };
  const start = { x: 0, y: 0, scale: 1, rotate: 0 };
  const from = [{ x: 150, y: 400 }, { x: 250, y: 400 }];
  // Fingers twice as far apart, same midpoint.
  let a = pinchAlign(start, from, [{ x: 100, y: 400 }, { x: 300, y: 400 }], stage);
  close(a.scale, 2);
  close(a.rotate, 0);
  close(a.x, 0);
  // Same distance, turned by 10 degrees about the midpoint, and moved 40 px right.
  const t = (10 * Math.PI) / 180;
  const to = [-1, 1].map((s) => ({ x: 240 + s * 50 * Math.cos(t), y: 400 + s * 50 * Math.sin(t) }));
  a = pinchAlign(start, from, to, stage);
  close(a.scale, 1);
  close(a.rotate, 10);
  close(a.x, 40 / 400);
  // Turning past the limit clamps; the angle wraps the short way round.
  const flipped = [{ x: 250, y: 400 }, { x: 150, y: 400 }];
  assert.equal(Math.abs(pinchAlign(start, from, flipped, stage).rotate), ALIGN_LIMITS.maxRotate);
  // Two fingers on the same spot don't divide by zero.
  const same = [{ x: 10, y: 10 }, { x: 10, y: 10 }];
  assert.deepEqual(pinchAlign(start, same, same, stage), { ...start });
});

test('nudgeAlign steps', () => {
  const a = nudgeAlign({ x: 0, y: 0, scale: 1, rotate: 0 }, { dx: 0.01, dy: -0.02, zoom: 1.05, turn: -1 });
  close(a.x, 0.01);
  close(a.y, -0.02);
  close(a.scale, 1.05);
  close(a.rotate, -1);
  assert.deepEqual(nudgeAlign(null), { ...DEFAULT_ALIGN });
});

test('the saved fit is kept per orientation and tolerates junk', () => {
  assert.equal(readAlignStore(null, 'portrait'), null);
  assert.equal(readAlignStore('junk', 'portrait'), null);
  assert.equal(readAlignStore({ portrait: 5 }, 'portrait'), null);
  let store = writeAlignStore(null, 'portrait', { x: 0.1, y: 0, scale: 1.3, rotate: 2 });
  store = writeAlignStore(store, 'landscape', { x: -0.2, y: 0.05, scale: 0.8, rotate: 0 });
  assert.equal(store.v, 1);
  assert.deepEqual(readAlignStore(store, 'portrait'), { x: 0.1, y: 0, scale: 1.3, rotate: 2 });
  assert.deepEqual(readAlignStore(store, 'landscape'), { x: -0.2, y: 0.05, scale: 0.8, rotate: 0 });
  assert.deepEqual(readAlignStore({ portrait: { scale: 99 } }, 'portrait'), { x: 0, y: 0, scale: ALIGN_LIMITS.maxScale, rotate: 0 });
  assert.deepEqual(writeAlignStore([1, 2], 'portrait', DEFAULT_ALIGN), { v: 1, portrait: { ...DEFAULT_ALIGN } });
});

// ---- tracking maths -------------------------------------------------------------------------------

test('coverFit matches object-fit: cover', () => {
  // A 1280x720 camera frame on a 390x844 portrait phone: scaled to the height, cropped at the sides.
  const c = coverFit(1280, 720, 390, 844);
  close(c.scale, 844 / 720);
  close(c.dy, 0);
  close(c.dx, (390 - 1280 * (844 / 720)) / 2);
  const d = coverFit(1280, 720, 1280, 720);
  assert.deepEqual(d, { scale: 1, dx: 0, dy: 0 });
});

test('rectToQuadMatrix maps the rectangle corners onto the quad (affine and perspective)', () => {
  const w = 320;
  const h = 200;
  const quads = [
    [[10, 20], [330, 20], [330, 220], [10, 220]], // moved
    [[0, 0], [160, 0], [160, 100], [0, 100]], // scaled
    [[50, 10], [300, 60], [250, 300], [0, 250]], // rotated / sheared parallelogram
    [[40, 30], [280, 10], [310, 230], [20, 190]], // perspective
  ];
  for (const quad of quads) {
    const m = rectToQuadMatrix(w, h, quad);
    assert.ok(m, 'a matrix');
    assert.equal(m.length, 16);
    [[0, 0], [w, 0], [w, h], [0, h]].forEach(([x, y], i) => closePt(applyMatrix3d(m, x, y), quad[i], 1e-6));
  }
  // The centre of a perspective quad is not the average of its corners — but it is where the diagonals cross.
  const q = quads[3];
  const m = rectToQuadMatrix(w, h, q);
  const c = applyMatrix3d(m, w / 2, h / 2);
  const cross = (a, b, c2, d) => {
    const den = (a[0] - b[0]) * (c2[1] - d[1]) - (a[1] - b[1]) * (c2[0] - d[0]);
    const t = ((a[0] - c2[0]) * (c2[1] - d[1]) - (a[1] - c2[1]) * (c2[0] - d[0])) / den;
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  closePt(c, cross(q[0], q[2], q[1], q[3]), 1e-6);
  assert.equal(rectToQuadMatrix(0, 10, q), null);
  assert.equal(rectToQuadMatrix(10, 10, [[0, 0], [0, 0], [0, 0], [0, 0]]), null);
  assert.equal(rectToQuadMatrix(10, 10, [[0, 0]]), null);
  assert.match(matrix3dCss(m), /^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/);
});

// MindAR's own conventions (src/image-target/controller.js), reproduced to check our projection.
function mindarWorldMatrix(mvt, markerH) {
  return [
    mvt[0][0], -mvt[1][0], -mvt[2][0], 0,
    -mvt[0][1], mvt[1][1], mvt[2][1], 0,
    -mvt[0][2], mvt[1][2], mvt[2][2], 0,
    mvt[0][1] * markerH + mvt[0][3], -(mvt[1][1] * markerH + mvt[1][3]), -(mvt[2][1] * markerH + mvt[2][3]), 1,
  ];
}
function mindarProjection(K, width, height, near = 10, far = 100000) {
  const proj = [
    [(2 * K[0][0]) / width, 0, -((2 * K[0][2]) / width - 1), 0],
    [0, (2 * K[1][1]) / height, -((2 * K[1][2]) / height - 1), 0],
    [0, 0, -(far + near) / (far - near), (-2 * far * near) / (far - near)],
    [0, 0, -1, 0],
  ];
  const out = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push(proj[j][i]);
  return out;
}

test('projectMarkerPoint agrees with a pinhole camera for MindAR matrices', () => {
  const W = 1280;
  const H = 720;
  const f = H / 2 / Math.tan((45 * Math.PI) / 180 / 2); // MindAR's 45 degree vertical field of view
  const K = [[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]];
  const proj = mindarProjection(K, W, H);
  const [mw, mh] = [1600, 1000];
  // The page 3000 units away, turned 20 degrees about the vertical axis, shifted a little.
  const a = (20 * Math.PI) / 180;
  const R = [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const t = [-700, -450, 3000];
  const mvt = R.map((row, i) => [...row, t[i]]);
  const world = mindarWorldMatrix(mvt, mh);
  const pinhole = (x, y) => {
    const X = R[0][0] * x + R[0][1] * y + t[0];
    const Y = R[1][0] * x + R[1][1] * y + t[1];
    const Z = R[2][0] * x + R[2][1] * y + t[2];
    return [(f * X) / Z + W / 2, (f * Y) / Z + H / 2];
  };
  for (const [x, y] of [[0, 0], [mw, 0], [mw, mh], [0, mh], [800, 500], [120, 870]]) {
    closePt(projectMarkerPoint(world, proj, x, y, mh, W, H), pinhole(x, y), 1e-6);
  }
  // trackedQuad adds the object-fit: cover mapping onto the screen.
  const cover = coverFit(W, H, 844, 390);
  const quad = trackedQuad(world, proj, [mw, mh], { width: W, height: H }, cover);
  assert.equal(quad.length, 4);
  closePt(quad[2], [pinhole(mw, mh)[0] * cover.scale + cover.dx, pinhole(mw, mh)[1] * cover.scale + cover.dy], 1e-6);
  // Behind the camera -> no projection.
  assert.equal(projectMarkerPoint(new Array(16).fill(0), proj, 0, 0, mh, W, H), null);
});

test('tracking is only for books that declare their targets (nothing is fetched otherwise)', () => {
  assert.equal(targetsPath({}), null);
  assert.equal(targetsPath({ targets: false }), null);
  assert.equal(targetsPath(null), null);
  assert.equal(targetsPath({ targets: true }), 'targets.mind');
  assert.equal(targetsPath({ targets: 'tracking/pages.mind' }), 'tracking/pages.mind');
  for (const bad of ['https://evil.test/t.mind', '../other/t.mind', '/t.mind', 'targets.js', 'a b.mind']) assert.equal(targetsPath({ targets: bad }), null, bad);
});

test('MindAR: every file is pinned by hash, and relative imports only reach checked files', () => {
  assert.ok(MINDAR_URL.startsWith(MINDAR_BASE));
  assert.equal(MINDAR_FILES.at(-1)[0], 'mindar-image.prod.js', 'the entry comes last, after its dependencies');
  for (const [name, sri] of MINDAR_FILES) {
    assert.match(name, /^[\w.-]+\.js$/);
    assert.match(sri, /^sha384-[A-Za-z0-9+/]{64}$/);
  }
  const urls = { 'controller-mGt1s8dJ.js': 'blob:c', 'ui-fBadYuor.js': 'blob:u' };
  assert.equal(
    rewriteImports('import { C as o } from "./controller-mGt1s8dJ.js";\nimport{U as i}from"./ui-fBadYuor.js";const m = import(\'./ui-fBadYuor.js\');', urls),
    'import { C as o } from "blob:c";\nimport{U as i}from"blob:u";const m = import(\'blob:u\');',
  );
  assert.equal(rewriteImports('const s = "./not-an-import.js"; import x from "https://cdn/x.js";', urls), 'const s = "./not-an-import.js"; import x from "https://cdn/x.js";');
  assert.throws(() => rewriteImports('import "./unknown.js";', urls), /unexpected import/);
  assert.throws(() => rewriteImports('export * from "../up.js";', urls), /unexpected import/);
});

test('loadMindAr asks for every file with its integrity hash and fails soft', async () => {
  const asked = [];
  const fetchImpl = async (url, opts) => {
    asked.push({ url, integrity: opts?.integrity, credentials: opts?.credentials });
    return { ok: false, status: 404, text: async () => '' };
  };
  await assert.rejects(loadMindAr({ fetchImpl }), /MindAR: ui-fBadYuor\.js \(404\)/);
  assert.deepEqual(asked, [{ url: `${MINDAR_BASE}ui-fBadYuor.js`, integrity: MINDAR_FILES[0][1], credentials: 'omit' }]);
  // A failure isn't cached: the next open tries again.
  await assert.rejects(loadMindAr({ fetchImpl }));
  assert.equal(asked.length, 2);
});
