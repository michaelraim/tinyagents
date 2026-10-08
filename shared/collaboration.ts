import { agentKey, type Agent, type OfficeEvent } from './protocol';
export type Conversation = {id:string;from:string;to:string;kind:'delegate'|'return'|'message';at:number};
/** Only a known, unambiguous recipient can become a visible conversation. */
export function resolveConversation(event:OfficeEvent,agents:Agent[]):Conversation|undefined{
  const link=event.collaboration;if(!link)return;
  const sender=agents.find(a=>a.key===agentKey(event));if(!sender)return;
  let candidates=agents.filter(a=>a.agentId===link.targetAgentId&&a.provider===sender.provider&&a.instanceId===sender.instanceId&&a.visitingOfficeId===sender.visitingOfficeId&&a.key!==sender.key);
  if(link.targetSessionId)candidates=candidates.filter(a=>a.sessionId===link.targetSessionId);
  else if(link.kind!=='message')candidates=candidates.filter(a=>a.sessionId===sender.sessionId&&a.project.id===sender.project.id);
  if(candidates.length!==1)return;
  const recipient=candidates[0];
  return {id:event.id,from:link.kind==='delegate'?recipient.key:sender.key,to:link.kind==='delegate'?sender.key:recipient.key,kind:link.kind,at:event.at};
}
/** Loading/reconnecting a snapshot never replays its past conversations. */
export class ConversationInbox {
  private seen:Set<string>|undefined;
  take(events:OfficeEvent[],agents:Agent[],now:number):Conversation[]{
    const previous=this.seen;this.seen=new Set(events.map(e=>e.id));if(!previous)return [];
    return events.filter(e=>!previous.has(e.id)&&now-e.at>=-1000&&now-e.at<8000).flatMap(e=>{const conversation=resolveConversation(e,agents);return conversation?[conversation]:[];}).reverse();
  }
}
