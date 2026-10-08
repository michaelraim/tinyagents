import { mkdir, writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const directory = () => path.join(process.env.SIDEQUEST_HOME || path.join(homedir(), '.sidequest'), 'diagnostics');
const stages = new Set(['hook.received','hook.ignored','hook.queued','hook.failed','delivery.scheduled','delivery.sent','delivery.failed','delivery.exhausted']);
const hooks = new Set(['SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','SubagentStart','SubagentStop','Stop','PreCompact','PostCompact','Notification','PostToolUseFailure','Interrupt']);
const files = async () => (await readdir(directory())).filter(f=>/^\d+-[a-f0-9-]+\.json$/.test(f)).sort();
export function errorCode(error) {
  if ([400,401,403,404,408,413,429,500,502,503,504].includes(error?.status)) return `http_${error.status}`;
  if (error?.name==='TimeoutError'||error?.name==='AbortError') return 'timeout';
  if (error?.code==='ENOENT') return 'not_configured';
  return 'local_or_network_error';
}
export async function diagnostic(stage, data = {}) {
  // Construct an allowlist; never serialize payloads, error messages or configs.
  if (!stages.has(stage)) return;
  const entry = { at: Date.now(), stage };
  if (['codex','claude'].includes(data.provider)) entry.provider=data.provider;
  if (hooks.has(data.hook)) entry.hook=data.hook;
  for (const key of ['durationMs','count','queueAgeMs','attempt']) if(Number.isFinite(data[key])) entry[key]=Math.max(0,Math.round(data[key]));
  for (const key of ['eventId','projectId','sessionId']) if(typeof data[key]==='string'&&/^[a-f0-9-]{24,36}$/.test(data[key])) entry[key]=data[key];
  if (/^(http_\d{3}|timeout|not_configured|local_or_network_error|invalid_payload|unsupported_hook)$/.test(data.error)) entry.error=data.error;
  try {
    await mkdir(directory(),{recursive:true});
    await writeFile(path.join(directory(),`${entry.at}-${randomUUID()}.json`),JSON.stringify(entry),{mode:0o600});
    const all=await files(),cutoff=Date.now()-3*86400000;
    await Promise.all(all.filter((file,i)=>i<all.length-400||Number(file.split('-')[0])<cutoff).map(file=>unlink(path.join(directory(),file)).catch(()=>{})));
  } catch { /* Diagnostics must not affect the coding client. */ }
}
export async function readDiagnostics(limit=80) {
  try {
    const entries=await Promise.all((await files()).slice(-Math.min(400,Math.max(1,limit))).map(async file=>{
      try {return JSON.parse(await readFile(path.join(directory(),file),'utf8'));} catch {return null;}
    }));
    return entries.filter(e=>e&&e.at>=Date.now()-3*86400000);
  } catch {return [];}
}
