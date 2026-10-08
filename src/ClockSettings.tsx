import { useState } from 'react';
import { localTimeZone, validTimeZone } from '../shared/clock';
export default function ClockSettings({officeId,timeZone,accountOwned=false}:{officeId:string;timeZone?:string;accountOwned?:boolean}){
  const [zone,setZone]=useState(timeZone??localTimeZone()),[key,setKey]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function importOwner(file?:File){
    if(!file)return;
    try{if(file.size>16384)throw Error();const data=JSON.parse(await file.text());if(data.officeId!==officeId||data.url&&data.url!==location.origin||typeof data.ownerKey!=='string')throw Error();setKey(data.ownerKey);setMessage('Owner file loaded. Choose a time zone and save.');}catch{setMessage('Choose the recovery file for this office.');}
  }
  async function save(){
    if(!validTimeZone(zone)){setMessage('Use a time zone such as Asia/Jerusalem or America/New_York.');return;}
    setBusy(true);setMessage('');try{const response=await fetch(`/api/clock?office=${encodeURIComponent(officeId)}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({timeZone:zone}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Could not save. Sign in again or check the owner recovery file.');setMessage('Office clock saved. Visitors will see this local time.');}catch(error){setMessage(error instanceof Error?error.message:'Could not reach your office.');}finally{setBusy(false);}
  }
  return <div className="clock-settings"><h3>Office clock</h3><p>Day and night follow this time zone, including daylight-saving changes.</p><label>Time zone<input value={zone} onChange={e=>setZone(e.target.value)} placeholder="Asia/Jerusalem" list="office-time-zones"/></label><datalist id="office-time-zones">{['UTC','Asia/Jerusalem','America/New_York','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Tokyo','Australia/Sydney'].map(z=><option key={z} value={z}/>)}</datalist><button onClick={()=>setZone(localTimeZone())}>Use my current time zone</button>{!accountOwned&&<label className="recovery-import">Load owner recovery file<input type="file" accept="application/json,.json" onChange={e=>void importOwner(e.target.files?.[0])}/></label>}<button disabled={(!accountOwned&&!key)||busy} onClick={()=>void save()}>{busy?'Saving…':'Save office clock'}</button>{message&&<p role="status">{message}</p>}</div>;
}
