#!/usr/bin/env node
// Wraps `expo export -p web` with automatic retries.
//
// nativewind's Metro integration has a startup race: on a cold cache, Metro
// can try to resolve the generated global.css before the Tailwind CLI child
// process has finished writing it, failing the whole export. Empirically this
// fails on the first attempt and succeeds immediately on a second attempt
// (the CSS file is on disk by then), 100% of the time in local testing. CI
// environments (GitHub Actions, Netlify) only get one shot per build unless
// we retry ourselves, so this wrapper does that automatically.
const { spawnSync } = require('node:child_process');

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 3000;
const args = ['expo', 'export', '-p', 'web', ...process.argv.slice(2)];

// Cross-platform synchronous sleep (no Windows `sleep` binary needed). Gives the
// Tailwind CLI child a moment to flush the generated global.css to disk before
// the next attempt re-resolves it — important on slower/cold CI filesystems.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`\n[build-web] attempt ${attempt}/${MAX_ATTEMPTS}: npx ${args.join(' ')}\n`);
  const result = spawnSync('npx', args, { stdio: 'inherit', shell: true });
  if (result.status === 0) {
    process.exit(0);
  }
  console.log(`\n[build-web] attempt ${attempt} failed (exit ${result.status}).`);
  if (attempt < MAX_ATTEMPTS) {
    console.log(`[build-web] waiting ${RETRY_DELAY_MS}ms before retry…`);
    sleepSync(RETRY_DELAY_MS);
  }
}

console.error(`\n[build-web] all ${MAX_ATTEMPTS} attempts failed.`);
process.exit(1);
