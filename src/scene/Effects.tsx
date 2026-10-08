import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { OfficeSimulation } from '../../shared/simulation';
import type { Agent } from '../../shared/protocol';
export function ReactionBurst({at,kind,paused}: {at:number;kind:string;paused:boolean}) {
  const ref=useRef<Group>(null),age=useRef(0);
  useEffect(()=>{age.current=0;},[at]);
  useFrame((_,dt)=>{if(!ref.current||paused)return;age.current+=Math.min(dt,.05);ref.current.visible=age.current<2.1;ref.current.children.forEach((p,i)=>{const a=i*2.4,t=age.current;p.position.set(Math.cos(a)*t*1.3,1.3+t*2-t*t*.8,Math.sin(a)*t*1.3);p.rotation.set(t*3+i,t*4,t*2);p.scale.setScalar(Math.max(0,1-t/2.1));});});
  return <group ref={ref}>{Array.from({length:28},(_,i)=><mesh key={i}><boxGeometry args={[.15,.16,.055]}/><meshStandardMaterial color={(kind==='snack'?['#eab868','#bd8154','#f7d795']:['#eaa7bb','#f0d780','#a4cea1','#c4b2e6'])[i%(kind==='snack'?3:4)]}/></mesh>)}</group>;
}

export function StatePulse({at,color,paused}:{at:number;color:string;paused:boolean}) {
  const ref=useRef<Mesh>(null),age=useRef(0);
  useEffect(()=>{age.current=0;},[at]);
  useFrame((_,dt)=>{if(!ref.current||paused)return;age.current+=Math.min(dt,.05);const t=age.current;ref.current.visible=t<1.7;ref.current.scale.setScalar(.5+t*1.4);(ref.current.material as MeshBasicMaterial).opacity=Math.max(0,.65*(1-t/1.7));});
  return <mesh ref={ref} rotation={[-Math.PI/2,0,0]} position={[0,.025,0]}><ringGeometry args={[.75,.85,48]}/><meshBasicMaterial color={color} transparent depthWrite={false}/></mesh>;
}

export function Footsteps({bodyKey,simulation,paused}:{bodyKey:string;simulation:OfficeSimulation;paused:boolean}) {
  const ref=useRef<Group>(null),time=useRef(0);
  useFrame((_,dt)=>{if(!ref.current||paused)return;const b=simulation.bodies.get(bodyKey);time.current+=dt;ref.current.visible=!!b&&b.travel>.7;ref.current.children.forEach((p,i)=>{const t=(time.current*2+i/5)%1;p.position.set((i%2?1:-1)*(.2+t*.1),.04+t*.08,-.1-t*.5);p.scale.setScalar((1-t)*.8);});});
  return <group ref={ref}>{Array.from({length:5},(_,i)=><mesh key={i}><boxGeometry args={[.1,.045,.1]}/><meshBasicMaterial color="#f3e7ce" transparent opacity={.48}/></mesh>)}</group>;
}

type Signal = { id:string; from:string; to:string; color:string };
function TeamSignal({signal,positions,paused}:{signal:Signal;positions:Map<string,Vector3>;paused:boolean}) {
  const ref=useRef<Group>(null),age=useRef(0);
  useFrame((_,dt)=>{
    if(!ref.current||paused)return;age.current+=Math.min(dt,.05);
    const from=positions.get(signal.from),to=positions.get(signal.to);ref.current.visible=age.current<2.7&&!!from&&!!to;
    if(!from||!to)return;
    ref.current.children.forEach((orb,i)=>{const t=Math.min(1,Math.max(0,(age.current-i*.12)/1.9));orb.position.lerpVectors(from,to,t);orb.position.y+=1.6+Math.sin(t*Math.PI)*1.6;orb.scale.setScalar(Math.sin(t*Math.PI)*(.95-i*.16));});
  });
  return <group ref={ref}>{[0,1,2,3].map(i=><mesh key={i}><octahedronGeometry args={[.14]}/><meshBasicMaterial color={signal.color} transparent opacity={1-i*.15}/></mesh>)}</group>;
}

export function TeamSignals({agents,positions,paused}:{agents:Map<string,Agent>;positions:Map<string,Vector3>;paused:boolean}) {
  const previous=useRef(new Map<string,string>()),[signals,setSignals]=useState<Signal[]>([]);
  useEffect(()=>{
    const next:Signal[]=[];
    for(const agent of agents.values()){
      const old=previous.current.get(agent.key);
      const parent=agent.parentAgentId?[...agents.values()].find(a=>a.agentId===agent.parentAgentId&&a.provider===agent.provider&&a.instanceId===agent.instanceId&&a.sessionId===agent.sessionId&&a.project.id===agent.project.id)?.key??'':'';
      if(parent&&agents.has(parent)&&old!==agent.state&&(old||previous.current.size)&&(!old||agent.state==='done'))next.push({id:agent.id,from:agent.state==='done'?agent.key:parent,to:agent.state==='done'?parent:agent.key,color:agent.state==='done'?'#e8d185':'#9bddce'});
    }
    previous.current=new Map([...agents.values()].map(a=>[a.key,a.state]));
    if(next.length)setSignals(current=>[...current,...next].slice(-6));
  },[agents]);
  return <>{signals.map(signal=><TeamSignal key={signal.id} signal={signal} positions={positions} paused={paused}/>)}</>;
}
