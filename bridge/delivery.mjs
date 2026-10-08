import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readConfig, outboxPath, queuedFiles, flush } from './transport.mjs';
import { diagnostic, errorCode } from './diagnostics.mjs';

export function scheduleDelivery() {
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--drain'],{detached:true,windowsHide:true,stdio:'ignore',env:process.env});
  child.on('error',error=>{void diagnostic('delivery.failed',{error:errorCode(error)});});
  child.unref();
}
export async function deliver(config) {
  // One bounded worker per office. Network latency never consumes the host's
  // three-second hook budget. A later hook can resume an exhausted outbox.
  const lock=path.join(outboxPath(config),'.delivery-lock');
  await queuedFiles(config);
  try {await mkdir(lock);} catch(error) {
    if(error.code!=='EEXIST')throw error;
    if(Date.now()-(await stat(lock).catch(()=>({mtimeMs:Date.now()}))).mtimeMs<90000)return;
    await rmdir(lock).catch(()=>{});
    try {await mkdir(lock);} catch {return;}
  }
  let drained=false;
  const started=Date.now();
  try {
    for(let attempt=0;attempt<4;attempt++) {
      if(attempt)await new Promise(resolve=>setTimeout(resolve,[0,1000,3000,9000][attempt]));
      try {
        for(let batch=0;batch<13&&Date.now()-started<45000;batch++) {
          if(!(await queuedFiles(config)).length){drained=true;return;}
          await flush(config,6000);
        }
      } catch(error) {
        if([400,401,403,404,413].includes(error.status))break;
      }
    }
    await diagnostic('delivery.exhausted',{count:(await queuedFiles(config)).length,durationMs:Date.now()-started});
  } finally {
    await rmdir(lock).catch(()=>{});
    if(drained&&(await queuedFiles(config)).length)scheduleDelivery();
  }
}
if(process.argv[2]==='--drain')readConfig().then(deliver).catch(error=>diagnostic('delivery.failed',{error:errorCode(error)}));
