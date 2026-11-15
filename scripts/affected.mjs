#!/usr/bin/env node
// Runs format / lint / check / test / test-e2e only on what changed since a base commit
// (e.g. `BASE=origin/main make test`, the same set as a PR diff).
//
//   node scripts/affected.mjs <format|format-check|lint|check|test|test-e2e> [base]
//
// `base` (or $BASE) is any git ref. The comparison starts at the merge-base of
// `base` and HEAD, and includes uncommitted and untracked files. Without a
// base, everything runs.
import { spawnSync } from 'node:child_process';

const [task, baseArg] = process.argv.slice(2);
const base = baseArg || process.env.BASE || '';

const run = (cmd, args) => {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const { status } = spawnSync(cmd, args, { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
};
const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
};
const lines = (s) => s.split('\n').filter(Boolean);

// Packages and the packages that consume them (the module graph of a test
// runner stops at the package boundary, so a dependency change re-runs them whole).
const PACKAGES = {
  'shared/core': { name: '@2tamago/core', dependents: ['api', 'web'] },
  api: { name: '@2tamago/api', dependents: [] },
  web: { name: '@2tamago/web', dependents: [] },
};
// Changes that can affect every package.
const GLOBAL = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json)$/;

const all = !base;
let mergeBase = '';
let files = [];
if (!all) {
  mergeBase = git('merge-base', base, 'HEAD');
  files = [
    ...new Set([
      ...lines(git('diff', '--name-only', '--diff-filter=ACMR', mergeBase)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
  console.log(`Changed since ${base} (${mergeBase.slice(0, 7)}): ${files.length} file(s)`);
}

const owner = (f) => Object.keys(PACKAGES).find((p) => f.startsWith(`${p}/`));
const everything = all || files.some((f) => GLOBAL.test(f));
const touched = new Set(files.map(owner).filter(Boolean));
/** package dir -> true when it must run whole, false when `--changed` is enough */
const plan = new Map();
for (const dir of Object.keys(PACKAGES)) {
  if (everything) plan.set(dir, true);
  else if (touched.has(dir)) plan.set(dir, plan.get(dir) ?? false);
}
if (!everything) {
  for (const dir of touched) {
    for (const dep of PACKAGES[dir].dependents) plan.set(dep, true);
  }
}

const vitest = (dir, whole, extra = []) => {
  const args = ['--filter', PACKAGES[dir].name, 'exec', 'vitest', 'run', ...extra];
  run('pnpm', whole ? args : [...args, '--changed', mergeBase, '--passWithNoTests']);
};

switch (task) {
  case 'format':
  case 'format-check': {
    const mode = task === 'format' ? '--write' : '--check';
    if (all) run('pnpm', [task === 'format' ? 'format' : 'format:check']);
    else if (files.length === 0) console.log('Nothing to format.');
    else
      run('pnpm', [
        'exec',
        'prettier',
        mode,
        '--ignore-unknown',
        '--no-error-on-unmatched-pattern',
        ...files,
      ]);
    break;
  }
  case 'lint': {
    if (all) run('pnpm', ['lint']);
    else if (files.length === 0) console.log('Nothing to lint.');
    else
      run('pnpm', [
        'exec',
        'biome',
        'lint',
        '--no-errors-on-unmatched',
        '--files-ignore-unknown=true',
        ...files,
      ]);
    break;
  }
  case 'check': {
    // Type-checking is not incremental: it runs per affected package.
    if (all) run('pnpm', ['check']);
    else if (plan.size === 0) console.log('No package affected: nothing to type-check.');
    else for (const dir of plan.keys()) run('pnpm', ['--filter', PACKAGES[dir].name, 'check']);
    break;
  }
  case 'test': {
    if (all) run('pnpm', ['test']);
    else if (plan.size === 0) console.log('No package affected: no tests to run.');
    else
      for (const [dir, whole] of plan) {
        vitest(dir, whole);
        if (dir === 'api') vitest(dir, whole, ['--config', './vitest.config.e2e.ts']);
      }
    break;
  }
  case 'test-e2e': {
    const e2eOnly = files.every((f) => f.startsWith('web/e2e/') || !owner(f));
    const args = ['--filter', '@2tamago/web', 'test:e2e'];
    if (all || everything || !e2eOnly)
      run('pnpm', args); // the browser tests exercise the built web app, API and engine
    else if (files.some((f) => f.startsWith('web/e2e/')))
      run('pnpm', [...args, '--only-changed', mergeBase]);
    else console.log('No change reaches the browser tests.');
    break;
  }
  default:
    console.error('Usage: affected.mjs <format|format-check|lint|check|test|test-e2e> [base]');
    process.exit(2);
}
