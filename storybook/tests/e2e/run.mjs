// Run every browser test in this folder (tests/e2e/*.e2e.mjs), one after
// another, each on its own port. Exits non-zero if any fails.
//
//   npm run e2e            # all
//   npm run e2e -- app     # only files whose name contains "app"

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const dir = new URL('./', import.meta.url);
const filter = process.argv[2] ?? '';
const files = (await readdir(dir)).filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter)).sort();

let port = Number(process.env.PORT_BASE ?? 8200);
const failures = [];
for (const f of files) {
  port += 1;
  const started = Date.now();
  process.stdout.write(`\n▶ ${f} (port ${port})\n`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(f, dir).pathname], { stdio: 'inherit', env: { ...process.env, PORT: String(port) } });
    child.on('exit', (c) => resolve(c ?? 1));
  });
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
