// Run every browser test in this folder (tests/e2e/*.e2e.mjs), one after
// another, each on its own free port. Exits non-zero if any fails.
//
//   npm run e2e            # all
//   npm run e2e -- app     # only files whose name contains "app"
//
// PORT_BASE (default 8200) is where the port search starts; ports that are
// already taken (another engineer's server, a stray one) are skipped, so two
// runs side by side don't collide. Each suite runs in its own process group,
// and the whole group is killed when it finishes, so a suite that forgets to
// stop its http-server can't leave one behind. E2E_TIMEOUT_MS (default 10
// minutes) stops a suite that hangs.

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';

const dir = new URL('./', import.meta.url);
const filter = process.argv[2] ?? '';
const files = (await readdir(dir)).filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter)).sort();
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 10 * 60 * 1000);
const groups = process.platform !== 'win32'; // process groups (kill(-pid)) are a POSIX thing

/** Can we listen on this port (all interfaces and loopback)? */
function canListen(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}
/** Is something already answering on this port? */
function answers(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(500, () => done(false));
  });
}
async function freePort(from, taken) {
  for (let p = from; p < from + 500; p++) {
    if (taken.has(p)) continue;
    if ((await canListen(p, '0.0.0.0')) && (await canListen(p, '127.0.0.1')) && !(await answers(p))) return p;
  }
  throw new Error(`no free port found from ${from}`);
}

function killGroup(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  try {
    if (groups) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    /* already gone */
  }
}

let current = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killGroup(current, 'SIGKILL');
    process.exit(130);
  });
}

const used = new Set();
let next = Number(process.env.PORT_BASE ?? 8200) + 1;
const failures = [];
for (const f of files) {
  const port = await freePort(next, used);
  used.add(port);
  next = port + 1;
  const started = Date.now();
  process.stdout.write(`\n▶ ${f} (port ${port})\n`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(f, dir).pathname], { stdio: 'inherit', detached: groups, env: { ...process.env, PORT: String(port) } });
    current = child;
    const timer = setTimeout(() => {
      process.stdout.write(`  ⏱ ${f} took longer than ${Math.round(TIMEOUT_MS / 1000)} s: stopping it\n`);
      killGroup(child, 'SIGKILL');
    }, TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on('exit', (c, signal) => {
      clearTimeout(timer);
      resolve(c ?? (signal ? 1 : 0));
    });
  });
  // Reap anything the suite left running in its group (e.g. an http-server).
  killGroup(current, 'SIGTERM');
  current = null;
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (code === 0) process.stdout.write(`✔ ${f} (${secs}s)\n`);
  else {
    process.stdout.write(`✖ ${f} exited with ${code} (${secs}s)\n`);
    failures.push(f);
  }
}
if (!files.length) console.log('No e2e files matched.');
if (failures.length) {
  console.error(`\n${failures.length} e2e file(s) failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${files.length} e2e file(s) passed.`);
}
