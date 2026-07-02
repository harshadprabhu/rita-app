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

const MAX_ATTEMPTS = 3;
const args = ['expo', 'export', '-p', 'web', ...process.argv.slice(2)];

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`\n[build-web] attempt ${attempt}/${MAX_ATTEMPTS}: npx ${args.join(' ')}\n`);
  const result = spawnSync('npx', args, { stdio: 'inherit', shell: true });
  if (result.status === 0) {
    process.exit(0);
  }
  console.log(`\n[build-web] attempt ${attempt} failed (exit ${result.status}).`);
}

console.error(`\n[build-web] all ${MAX_ATTEMPTS} attempts failed.`);
process.exit(1);
