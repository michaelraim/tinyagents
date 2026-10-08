import { useEffect, useRef, useState } from 'react';
import type { Agent, OfficeEvent } from '../../shared/protocol';
import { effectiveState } from '../../shared/protocol';
import { ConversationInbox, type Conversation } from '../../shared/collaboration';
import type { OfficeSimulation } from '../../shared/simulation';
export type Talk = {partner:string;label:string;until:number;observed:boolean};
export function useConversations(events:OfficeEvent[],agents:Map<string,Agent>,simulation:OfficeSimulation,now:number,paused:boolean){
  const inbox=useRef(new ConversationInbox()),[conversations,setConversations]=useState<Conversation[]>([]),[talks,setTalks]=useState<Record<string,Talk>>({});
  const nextChatter=useRef(now+18000),venue=useRef(0);
  useEffect(()=>{
    const fresh=inbox.current.take(events,[...agents.values()],now);
    if(paused||!fresh.length)return;
    setConversations(current=>[...current.filter(c=>now-c.at<10000),...fresh].slice(-4));
    const additions:Record<string,Talk>={};
    {
      const next=additions;
      for(const c of fresh){
        const gathered=simulation.gather([c.from,c.to],c.kind==='return'?'duck':c.kind==='delegate'?'standup':'coffee');
        const label=c.kind==='delegate'?'📋 New assignment':c.kind==='return'?'✅ Reporting back':'💬 Message sent';
        next[c.from]={partner:c.to,label:gathered===2?'🚶 '+label:label,until:now+(gathered===2?110000:8500),observed:true};
        next[c.to]={partner:c.from,label:c.kind==='return'?'👂 Receiving report':c.kind==='delegate'?'🫡 On it':'👂 Listening',until:next[c.from].until,observed:true};
      }
    }
    setTalks(current=>({...current,...additions}));
  },[events,agents,simulation,paused,now]);
  useEffect(()=>{
    if(paused||now<nextChatter.current)return;nextChatter.current=now+28000;
    const available=[...agents.values()].filter(a=>['idle','done'].includes(effectiveState(a,now))&&(!talks[a.key]||talks[a.key].until<now));
    if(available.length<2)return;
    const index=venue.current++,first=available[index%available.length],second=available.find(a=>a.key!==first.key&&a.project.id!==first.project.id)??available.find(a=>a.key!==first.key)!;
    const kind=(['coffee','duck','standup','arcade'] as const)[index%4];
    if(simulation.gather([first.key,second.key],kind)!==2)return;
    const label=({coffee:'☕ Break chat',duck:'🦆 Rubber-duck club',standup:'👋 Hallway hello',arcade:'👾 Friendly rivalry'})[kind];
    setTalks(current=>({...current,[first.key]:{partner:second.key,label,until:now+110000,observed:false},[second.key]:{partner:first.key,label,until:now+110000,observed:false}}));
  },[now,agents,simulation,paused,talks]);
  const active=Object.fromEntries(Object.entries(talks).filter(([key,talk])=>talk.until>now&&(talk.observed||!!simulation.bodies.get(key)?.rendezvous)&&agents.has(talk.partner)&&agents.has(key)&&(talk.observed||['idle','done'].includes(effectiveState(agents.get(key)!,now))&&['idle','done'].includes(effectiveState(agents.get(talk.partner)!,now)))));
  return {conversations,talks:active};
}
