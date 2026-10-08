import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';

it('retries a failed send without another hook and logs only safe diagnostic fields', async () => {
  await mkdir('.local',{recursive:true});const home=await mkdtemp(resolve('.local/delivery-'));
  let requests=0, accepted=0;
  let releaseResponse=()=>{};
  const responseGate=new Promise<void>(resolve=>{releaseResponse=resolve;});
  const server=createServer(async (req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests++;
    if(requests===1){res.writeHead(503);res.end('PRIVATE_SERVER_ERROR');return;}
    await responseGate;
    await new Promise(r=>setTimeout(r,2200));
    accepted+=JSON.parse(body).events.length;res.end('{}');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw Error('No port');
  const secret='a'.repeat(64);
  await writeFile(join(home,'config.json'),JSON.stringify({endpoint:`http://127.0.0.1:${address.port}/api/events`,officeId:'12345678-1234-4123-8123-123456789abc',ingestKey:secret}));
  try {
    const child=spawn(process.execPath,['bridge/emit.mjs','codex'],{windowsHide:true,env:{...process.env,SIDEQUEST_HOME:home,SIDEQUEST_CONFIG:join(home,'config.json')},stdio:'pipe'});
    let output='',errors='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>errors+=c);
    child.stdin.end(JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'PRIVATE_SESSION',cwd:home,prompt:'PRIVATE_PROMPT',tool_input:{command:'PRIVATE_COMMAND'}}));
    await once(child,'exit');
    expect(output).toBe('{}');expect(errors).toBe('');expect(accepted).toBe(0);releaseResponse();
    let records:Record<string,unknown>[]=[];
    for(let i=0;i<100;i++) {
      const names=await readdir(join(home,'diagnostics')).catch(():string[]=>[]);
      records=await Promise.all(names.map(async name=>JSON.parse(await readFile(join(home,'diagnostics',name),'utf8'))));
      if(records.some(r=>r.stage==='delivery.sent'))break;
      await new Promise(r=>setTimeout(r,100));
    }
    expect(accepted).toBe(1);expect(requests).toBe(2);
    expect(records.map(r=>r.stage)).toEqual(expect.arrayContaining(['hook.received','hook.queued','delivery.failed','delivery.sent']));
    expect(records.find(r=>r.stage==='delivery.failed')?.error).toBe('http_503');
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE_|ingestKey|prompt|tool_input|command|endpoint/);
    expect(JSON.stringify(records)).not.toContain(secret);expect(JSON.stringify(records)).not.toContain(home);
    const outbox=await readdir(join(home,'outbox','12345678-1234-4123-8123-123456789abc'));
    expect(outbox.filter(f=>f.endsWith('.json'))).toEqual([]);
  } finally {
    releaseResponse();server.closeAllConnections();server.close();
    // Worker exits after releasing its empty directory lock.
    for(let i=0;i<30;i++){const names=await readdir(join(home,'outbox','12345678-1234-4123-8123-123456789abc')).catch(():string[]=>[]);if(!names.includes('.delivery-lock'))break;await new Promise(r=>setTimeout(r,100));}
    if(resolve(home).startsWith(resolve('.local')+sep+'delivery-'))await rm(home,{recursive:true,force:true});
  }
},15000);
