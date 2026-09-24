// Run every browser test in this folder (tests/e2e/*.e2e.mjs), one after
// another, each on its own free port. Exits non-zero if any fails.
//
//   npm run e2e            # all
//   npm run e2e -- app     # only files whose name contains "app"
//
// PORT_BASE (default 8200) is where the port search starts; ports that are
// already taken (another engineer's server, a stray one) are skipped, so two
// runs side by side don't collide. Each suite runs in its own process group,
// and the whole group is killed when it finishes.
//
// Suites start their http-server in a process group of its own (so they can
// stop it however they end), which the runner's group kill can't reach. So a
// suite being stopped (timeout, Ctrl-C) always gets SIGTERM first and a few
// seconds to stop its server, and only then SIGKILL; and after every suite
// any http-server still listening on that suite's port is stopped too.
//
// A suite that hangs is stopped after its time limit: E2E_TIMEOUT_MS for all,
// or E2E_TIMEOUT_<NAME>_MS for one (e.g. E2E_TIMEOUT_READER_MS); the default
// is 15 minutes, more for the longest suites (SUITE_TIMEOUTS below).

import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';

const dir = new URL('./', import.meta.url);
const filter = process.argv[2] ?? '';
const files = (await readdir(dir)).filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter)).sort();
const MIN = 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15 * MIN;
// Suites known to run long (the reader works every page of both real books with several names).
const SUITE_TIMEOUTS = { reader: 25 * MIN, ar: 20 * MIN };
const GRACE_MS = 6000; // between SIGTERM and SIGKILL
const groups = process.platform !== 'win32'; // process groups (kill(-pid)) are a POSIX thing

/** The time limit for one suite file ("reader.e2e.mjs" -> reader). */
function timeoutFor(file, env = process.env) {
  const name = file.replace(/\.e2e\.mjs$/, '');
  const own = Number(env[`E2E_TIMEOUT_${name.toUpperCase().replace(/\W/g, '_')}_MS`]);
  if (own > 0) return own;
  const all = Number(env.E2E_TIMEOUT_MS);
  if (all > 0) return all;
  return SUITE_TIMEOUTS[name] ?? DEFAULT_TIMEOUT_MS;
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Stop a suite: SIGTERM so its exit handlers stop its own server, then
 * SIGKILL for anything still running after the grace period.
 */
async function stopSuite(child) {
  if (!child?.pid) return;
  killGroup(child, 'SIGTERM');
  const until = Date.now() + GRACE_MS;
  while (alive(child.pid) && Date.now() < until) await sleep(100);
  killGroup(child, 'SIGKILL');
}

/**
 * Any http-server left listening on `port` (a suite killed before it could
 * stop its own): stop its whole process group. Linux only (reads /proc); a
 * no-op elsewhere. Returns how many groups were stopped.
 */
async function reapServers(port) {
  if (process.platform !== 'linux') return 0;
  let pids = [];
  try {
    pids = (await readdir('/proc')).filter((d) => /^\d+$/.test(d));
  } catch {
    return 0;
  }
  const pgids = new Set();
  for (const pid of pids) {
    try {
      const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
      if (!args.some((a) => /http-server/.test(a))) continue;
      const i = args.indexOf('-p');
      const flat = args.join(' ');
      if (!(i >= 0 && args[i + 1] === String(port)) && !new RegExp(`-p\\s+${port}(\\s|$)`).test(flat)) continue;
      // Field 5 of /proc/<pid>/stat is the process group (after the "(comm)" field).
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]);
      if (pgid > 1 && pgid !== process.pid) pgids.add(pgid);
    } catch {
      /* gone, or not ours to read */
    }
  }
  for (const g of pgids) {
    try {
      process.kill(-g, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  if (pgids.size) {
    await sleep(500);
    for (const g of pgids) {
      try {
        process.kill(-g, 'SIGKILL');
      } catch {
        /* stopped */
      }
    }
  }
  return pgids.size;
}

let current = null;
let currentPort = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await stopSuite(current);
    if (currentPort) await reapServers(currentPort);
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
  const limit = timeoutFor(f);
  process.stdout.write(`\n▶ ${f} (port ${port})\n`);
  currentPort = port;
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(f, dir).pathname], { stdio: 'inherit', detached: groups, env: { ...process.env, PORT: String(port) } });
    current = child;
    const timer = setTimeout(() => {
      process.stdout.write(`  ⏱ ${f} took longer than ${Math.round(limit / 1000)} s: stopping it\n`);
      stopSuite(child);
    }, limit);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on('exit', (c, signal) => {
      clearTimeout(timer);
      resolve(c ?? (signal ? 1 : 0));
    });
  });
  // Reap anything the suite left running in its group, and any server of its
  // own group still listening on its port.
  killGroup(current, 'SIGTERM');
  current = null;
  const reaped = await reapServers(port);
  if (reaped) process.stdout.write(`  (stopped ${reaped} http-server group(s) ${f} left on port ${port})\n`);
  currentPort = null;
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
