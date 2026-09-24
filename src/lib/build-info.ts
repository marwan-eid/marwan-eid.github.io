import { execSync } from 'node:child_process';

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

export const buildInfo = {
  sha: gitSha(),
  builtAt: new Date().toISOString(),
  repo: 'https://github.com/marwan-eid/marwan-eid.github.io',
};
