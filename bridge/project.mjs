import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';

const canonicalPath = value => (/^[a-z]:\//i.test(value) ? value.toLowerCase() : value).replace(/\/$/, '');
const slash = value => value.replace(/\\/g, '/');
export function canonicalRemote(remote) {
  const value = remote.trim();
  let url;
  try { url = new URL(/^[^/@]+@[^:]+:/.test(value) ? value.replace(/^[^@]+@([^:]+):/, 'ssh://$1/') : value); } catch { return null; }
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) return null;
  const repository = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!repository) return null;
  const name = `${url.host.toLowerCase()}/${repository}`;
  return ['github.com', 'bitbucket.org'].includes(url.hostname.toLowerCase()) ? name.toLowerCase() : name;
}
function git(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 500, maxBuffer: 16384, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { return ''; }
}
/** Git metadata stays local. Only the resulting fingerprint and safe display fields leave the machine. */
export function resolveProject(cwd, config = {}) {
  let directory = cwd;
  try { directory = realpathSync(cwd); } catch { /* Offline/deleted directory: use the supplied identity. */ }
  const root = git(directory, ['rev-parse', '--show-toplevel']) || directory;
  const remote = canonicalRemote(git(root, ['config', '--get', 'remote.origin.url']));
  const common = !remote ? git(root, ['rev-parse', '--git-common-dir']) : '';
  const entries = Object.entries(config.projects ?? {}).sort((a, b) => b[0].length - a[0].length);
  const override = entries.find(([key]) => {
    const base = canonicalPath(slash(key)), current = canonicalPath(slash(directory));
    return current === base || current.startsWith(base + '/');
  })?.[1] ?? {};
  const merged = { ...config, ...override };
  const identity = merged.projectId ? 'manual' : remote || common ? 'repository' : 'folder';
  const source = merged.projectId || (remote ? `repo:${remote}` : canonicalPath(slash(common ? path.resolve(root, common) : root)));
  return { ...merged, projectId: source, projectIdentity: identity,
    projectName: merged.projectName || (remote ? remote.split('/').pop() : path.basename(root)),
    instanceId: merged.instanceId || createHash('sha256').update(config.officeId || 'local').update(hostname()).digest('hex').slice(0, 24) };
}
