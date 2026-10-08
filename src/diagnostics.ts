import type { OfficeState } from '../shared/protocol';

type Stage='feed.connecting'|'feed.open'|'feed.retry'|'feed.snapshot'|'feed.unreadable'|'campus.changed';
type Entry={at:number;stage:Stage;revision?:number;agents?:number;projects?:number;latestEventAgeMs?:number;rooms?:number};
const entries:Entry[]=[];
export function recordDiagnostic(stage:Stage,metrics:Omit<Entry,'at'|'stage'>={}) {
  const entry:Entry={at:Date.now(),stage};
  for(const key of ['revision','agents','projects','latestEventAgeMs','rooms'] as const)if(Number.isFinite(metrics[key]))entry[key]=metrics[key];
  entries.push(entry);if(entries.length>200)entries.shift();
}
export function recordSnapshot(office:OfficeState) {
  recordDiagnostic('feed.snapshot',{revision:office.revision,agents:office.agents.length,projects:new Set(office.agents.map(a=>a.project.id)).size,latestEventAgeMs:office.events.length?Math.max(0,Date.now()-Math.max(...office.events.map(e=>e.at))):undefined});
}
export function diagnosticReport() {return {schema:1,generatedAt:new Date().toISOString(),browser:entries.slice(),note:'Event age includes queued delivery and idle time; it is not network latency. No prompts, names, URLs, paths or credentials are included.'};}
