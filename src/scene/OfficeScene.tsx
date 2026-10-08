import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { WorldHtml as Html } from './WorldHtml';
import { Color, Group, MathUtils, MeshStandardMaterial, Vector3, type OrthographicCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Box, Plant, CoffeeSteam } from './Props';
import { Sign, Tree, Whiteboard, Fountain, InteractiveProp, type WorldAction } from './WorldProps';
import { VoxelModel } from './VoxelModel';
import { Character, type Reaction, type AgentPositions } from './Character';
import { TeamSignals } from './Effects';
import { useConversations } from './Collaboration';
import { effectiveState, summarizeAgents, teamMeta, stateMeta, agentRole, type Agent, type AgentState, type OfficeEvent, type Project } from '../../shared/protocol';
import { officePlan, type Room, type Seat, type Rect, type OfficePlan } from '../../shared/layout';
import { OfficeSimulation } from '../../shared/simulation';
import { verticalById, propById, suggestedVertical } from '../../shared/verticals.mjs';
import { projectColor } from '../designs';
import { ProjectSign } from './GameLabels';
import { officeClock } from '../../shared/clock';
import { cameraDistance, cameraFar } from '../../shared/camera';
import { hangouts, type Hangout } from '../../shared/neighborhood';

export type RoomDesign = { vertical: string; props: string[]; description?: string };
export type Designs = Record<string, RoomDesign>;
export type CameraAction = { type: 'in' | 'out' | 'home' | 'rotate'; id: number };

function Floor({rect,color='#e5d7be',wood=false}:{rect:Rect;color?:string;wood?:boolean}) {
  return <group position={[rect.x,0,rect.z]}>
    <Box size={[rect.w+.12,.6,rect.d+.12]} color="#788888" position={[0,-.29,0]}/>
    <Box size={[rect.w,.13,rect.d]} color={color} position={[0,.065,0]}/>
    {Array.from({length:Math.floor(rect.w/(wood?.7:2))},(_,i)=><Box key={i} size={[.018,.008,rect.d-.2]} color={wood?'#cdb997':'#cbd1c7'} position={[-rect.w/2+(i+1)*(wood?.7:2),.138,0]}/>)}
    {!wood&&Array.from({length:Math.floor(rect.d/2)},(_,i)=><Box key={i} size={[rect.w-.2,.008,.018]} color="#cbd1c7" position={[0,.138,-rect.d/2+(i+1)*2]}/>)}
  </group>;
}

function Glass({size,position}:{size:[number,number,number];position:[number,number,number]}) {
  return <group><mesh position={position}><boxGeometry args={size}/><meshStandardMaterial color="#a3cdd0" transparent opacity={.2} roughness={.2} depthWrite={false}/></mesh><Box size={[size[0]+.02,.045,size[2]+.02]} color="#8baba7" position={[position[0],position[1]+size[1]/2,position[2]]}/></group>;
}

function RoomShell({room,color,agents,now,onFocus}:{room:Room;color:string;agents:Agent[];now:number;onFocus:()=>void}) {
  const {w,d,side}=room, inner=-side*w/2, outer=side*w/2, back=d-3.65;
  const summary=summarizeAgents(agents,now),status=teamMeta[summary.status];
  return <group position={[room.x,0,room.z]}>
    <Box size={[w-.65,.026,d-3.9]} color={color} position={[0,.16,-.8]}/>
    {[-w/2+.5,w/2-.5].map(x=><Box key={x} size={[.045,.008,d-4.1]} color="#ede9d2" position={[x,.18,-.8]}/>)}
    <Box size={[w,3.5,.22]} color="#e5e5d8" position={[0,1.88,-d/2]}/>
    <Box size={[w+.15,.14,.32]} color="#566d6d" position={[0,3.7,-d/2]}/>
    <Box size={[w,.28,.12]} color={color} position={[0,.3,-d/2+.16]}/>
    <Box size={[w,.5,.22]} color="#d8ddcf" position={[0,.38,d/2]}/>
    <Box size={[w,.06,.28]} color="#8fa6a0" position={[0,.66,d/2]}/>
    <Box size={[.22,.6,d]} color="#e1e4d6" position={[outer,.43,0]}/>
    <Glass size={[.08,1.25,d-.3]} position={[outer,1.37,0]}/>
    {[-d/2,d/2,0].map(z=><Box key={z} size={[.16,2.05,.16]} color="#7f9c97" position={[outer,1.15,z]}/>)}
    <Box size={[.22,.75,back]} color="#e1e4d6" position={[inner,.51,-d/2+back/2]}/>
    <Glass size={[.07,1.2,back]} position={[inner,1.48,-d/2+back/2]}/>
    <Box size={[.22,.75,1.05]} color="#e1e4d6" position={[inner,.51,d/2-.525]}/>
    {[d/2-3.65,d/2-1.05].map(z=><Box key={z} size={[.28,2.6,.28]} color="#637d78" position={[inner,1.43,z]}/>)}
    <Box size={[.3,.18,2.9]} color={color} position={[inner,2.83,d/2-2.35]}/>
    <mesh position={[inner-side*.17,2.38,d/2-1.1]}><boxGeometry args={[.07,.28,.17]}/><meshStandardMaterial color={status.color} emissive={status.color} emissiveIntensity={.9}/></mesh>
    <Box size={[1.35,.028,2.5]} color={color} position={[inner,.155,d/2-2.35]}/>
    <Box size={[w-1,1.1,1]} color="#b69a79" position={[0,.69,-d/2+.65]}/>
    <Box size={[w-.85,.1,1.12]} color="#e8ceb0" position={[0,1.28,-d/2+.65]}/>
    {Array.from({length:Math.floor(w/1.6)},(_,i)=><group key={i}><Box size={[1.4,.79,.025]} color={i%3?'#cdb493':'#8eaca4'} position={[-w/2+1.3+i*1.6,.76,-d/2+1.16]}/><Box size={[.3,.035,.045]} color="#6c7770" position={[-w/2+1.3+i*1.6,.98,-d/2+1.2]}/></group>)}
    <group onClick={e=>{e.stopPropagation();onFocus()}}><Sign text={room.name.toUpperCase()} color="#e5e5d8" ink="#3d5b5c" width={Math.min(7.8,w-1.5)} height={.82} position={[0,3.03,-d/2+.135]}/></group>
    <Sign text={`${room.first?room.session.name+' · ':''}${room.session.provider==='codex'?'CODEX':'CLAUDE CODE'}${room.annex?' · ANNEX '+room.annex:''}`} color="#e5e5d8" ink="#798a7c" width={Math.min(6,w-2)} height={.35} position={[0,2.43,-d/2+.14]}/>
    <Sign text={`${summary.running} WORKING  /  ${summary.attention} NEED INPUT  /  ${summary.counts.done} DONE`} color="#344e52" ink={status.color} width={Math.min(5.5,w-2)} height={.38} position={[0,1.88,-d/2+1.21]}/>
    {agents[0]?.officeName && <Sign text={agents[0].officeName.toUpperCase()} color="#566d6d" ink="#fff4da" width={Math.min(5.5,w-2)} height={.28} position={[0,3.72,-d/2+.17]}/>}
  </group>;
}

function Workstation({seat,agent,state,color,simulation,paused}:{seat:Seat;agent:Agent;state:AgentState;color:string;simulation:OfficeSimulation;paused:boolean}) {
  const screen=useRef<Group>(null),chair=useRef<Group>(null),light=useRef<MeshStandardMaterial>(null),time=useRef(0);
  const active=['coding','thinking','reading','testing'].includes(state),attention=state==='waiting'||state==='blocked';
  useFrame((_,dt)=>{
    if(paused)return;time.current+=Math.min(dt,.05);const t=time.current;
    if(screen.current)screen.current.children.forEach((line,i)=>{line.scale.x=active?.6+.4*Math.sin(t*(state==='reading'?.5:2)+i*.8)**2:1;});
    if(light.current)light.current.emissiveIntensity=attention?.6+Math.sin(t*3)*.4:active?.5+Math.sin(t*1.5)*.15:.15;
    const sim=simulation.bodies.get(agent.key);
    if(chair.current&&sim)chair.current.position.z=MathUtils.damp(chair.current.position.z,sim.phase==='desk'?1.68:.74,6,dt);
  });
  return <group position={[seat.desk.x,.14,seat.desk.z]} rotation={[0,seat.facing===0?Math.PI:0,0]}>
    <Box size={[3.1,.15,1.5]} color="#e8c79d" position={[0,1.1,0]}/>
    {[-1.3,1.3].map(x=><group key={x}><Box size={[.11,1.05,1.2]} color="#4e6669" position={[x,.53,0]}/><Box size={[.4,.075,1.2]} color="#4e6669" position={[x,.05,0]}/></group>)}
    <Box size={[.9,.85,1.15]} color="#dae0d5" position={[-.92,.56,-.03]}/>
    {[.3,.57,.85].map(y=><group key={y}><Box size={[.79,.025,.04]} color="#b3beb3" position={[-.92,y,.566]}/><Box size={[.25,.028,.045]} color="#7f958d" position={[-.92,y+.1,.596]}/></group>)}
    <Box size={[2.03,.027,.72]} color="#8ea5a2" position={[.35,1.19,.32]}/>
    <Box size={[.12,.43,.12]} color="#42545c" position={[0,1.39,-.28]}/><Box size={[.6,.07,.4]} color="#42545c" position={[0,1.22,-.27]}/>
    <Box size={[1.72,1.03,.13]} color="#33464f" position={[0,1.94,-.3]}/>
    <Box size={[1.56,.87,.026]} color="#203b47" position={[0,1.95,-.22]}/>
    {active?<group ref={screen} position={[-.59,2.22,-.199]}>{Array.from({length:6},(_,i)=><Box key={i} size={[.3+(i%3)*.2,.035,.012]} color={i%3?stateMeta[state].color:'#e7dab5'} position={[.2+(i%2)*.1,-i*.106,0]}/>)}</group>:<Sign text={state==='waiting'?'?':state==='blocked'?'!':state==='done'?'✓':state==='offline'?'Z Z':'—'} width={1.25} height={.63} color="#203b47" ink={stateMeta[state].color} position={[0,1.97,-.197]}/>}
    <Box size={[1,.055,.34]} color="#eff0df" position={[0,1.24,.44]}/>
    {Array.from({length:12},(_,i)=><Box key={i} size={[.13,.015,.07]} color={i%4===0?color:'#b7c3bb'} position={[-.36+i%6*.14,1.277,.35+Math.floor(i/6)*.14]}/>)}
    <Box size={[.16,.06,.24]} color="#eef0df" position={[.8,1.25,.4]}/>
    <VoxelModel family="mug" color={color} scale={.3} position={[1.26,1.19,-.2]}/>
    <Sign text={agent.name} color="#425e60" width={.95} height={.2} position={[.15,.98,.76]}/>
    <mesh position={[1.28,1.36,.43]}><boxGeometry args={[.13,.25,.13]}/><meshStandardMaterial ref={light} color={stateMeta[state].color} emissive={stateMeta[state].color} emissiveIntensity={.7}/></mesh>
    <group ref={chair} position={[0,0,1.68]} rotation={[0,Math.PI,0]}><VoxelModel family="chair" color={color} scale={1.1}/></group>
    {attention&&<Sign text={state==='waiting'?'INPUT':'BLOCKED'} color={stateMeta[state].color} ink="#fff2d7" width={.93} height={.25} position={[.95,1.73,.44]}/>}
  </group>;
}

function ProjectRoom({room,design,agents,now,simulation,paused,onFocus,mark,night}:{room:Room;design?:RoomDesign;agents:Map<string,Agent>;now:number;simulation:OfficeSimulation;paused:boolean;onFocus:()=>void;mark:string;night:boolean}) {
  const vertical=verticalById.get(design?.vertical??room.agents[0]?.project.vertical??suggestedVertical(room.name))??verticalById.get('software')!;
  const props=(design?.props??vertical.props.slice(0,8).map(p=>p.id)).map(id=>propById.get(id)).filter(Boolean);
  const members=room.agents.map(a=>agents.get(a.key)??a),[hover,setHover]=useState('');
  const localNight=members[0]?.officeTimeZone?officeClock(members[0].officeTimeZone,now).daylight<.4:night;
  return <group>
    <Floor rect={room} color="#e3d7bd" wood/>
    <mesh position={[room.x,1.4,room.z-room.d/2+.6]}><boxGeometry args={[room.w-1,.07,.8]}/><meshStandardMaterial color={localNight?'#ffcc88':'#ece0ba'} emissive="#ffc780" emissiveIntensity={localNight?2.2:0}/></mesh>
    {localNight&&room.first&&Number(mark)<=8&&<pointLight position={[room.x,3,room.z-1]} color="#ffd5a0" intensity={14} distance={Math.max(room.w,room.d)} decay={1.5}/>}
    {room.first&&<ProjectSign name={room.name} subtitle={vertical.name+(members[0]?.officeTimeZone?' · '+officeClock(members[0].officeTimeZone,now).time:'')} mark={mark} color={projectColor(room.projectId)} position={[room.x-room.side*(room.w/2-.5),.15,room.doorZ-1.6]} onClick={onFocus}/>}
    <RoomShell room={room} color={projectColor(room.projectId)} agents={members} now={now} onFocus={onFocus}/>
    <group onClick={e=>{e.stopPropagation();onFocus()}}><Sign text={`${mark}  /  ${room.name.toUpperCase()}`} width={Math.min(room.w-1,8)} height={.65} color={projectColor(room.projectId)} ink="#fff9e3" position={[room.x,.18,room.z+room.d/2-.5]} rotation={[-Math.PI/2,0,0]}/></group>
    {room.seats.map(seat=>{const agent=agents.get(seat.agent.key)??seat.agent;return <Workstation key={agent.key} seat={seat} agent={agent} state={effectiveState(agent,now)} color={vertical.color} simulation={simulation} paused={paused}/>;})}
    {room.fixtures.map((f,i)=><group key={i} position={[f.x,.14,f.z]}>
      {f.kind==='printer'?<><Box size={[1.8,.98,1.5]} color="#bbc6b8" position={[0,.49,0]}/><Box size={[1.75,.1,1.5]} color="#edd4ac" position={[0,1.03,0]}/><VoxelModel family="printer" color="#536a74" position={[0,1.1,0]} scale={.72}/><Sign text="PRINT / SCAN" color="#bbc6b8" ink="#536e62" width={1.4} height={.25} position={[0,.62,.76]}/></>:f.kind==='collab'?<><Box size={[4.2,.035,3.2]} color="#b4bfb0" position={[0,.02,0]}/><Box size={[2.3,.15,1.5]} color="#ddb78e" position={[0,1.02,0]}/><Box size={[.8,.9,.8]} color="#778f89" position={[0,.47,0]}/>{[-1.5,1.5].map(x=><VoxelModel key={x} family="chair" color="#91afa8" position={[x,0,0]} rotation={[0,x>0?Math.PI/2:-Math.PI/2,0]} scale={.9}/>)}<VoxelModel family="books" color="#e0b16d" scale={.4} position={[.6,1.12,.1]}/><Plant position={[-.6,1.12,0]} scale={.5}/><Sign text="PAIRING CORNER" color="#b4bfb0" ink="#5e7b6b" width={3} height={.35} position={[0,.049,1.3]} rotation={[-Math.PI/2,0,0]}/></>:<><Box size={[2,.55,1.8]} color="#c4ac88" position={[0,.28,0]}/><VoxelModel family={props[0]?.family??'plant'} color={props[0]?.color??vertical.color} variant={props[0]?.variant??0} scale={.8} position={[0,.59,0]}/></>}
    </group>)}
    <group position={[room.x,0,room.z]}>
      {props.map((prop,i)=>prop&&<group key={`${prop.id}-${i}`} position={[-room.w/2+1.1+i*(room.w-2.2)/Math.max(1,props.length-1),1.34,-room.d/2+.63]} onPointerOver={e=>{e.stopPropagation();setHover(prop.id)}} onPointerOut={()=>setHover('')}>
        <VoxelModel family={prop.family} color={prop.color} variant={prop.variant} scale={Math.min(.59,(room.w-2)/props.length*.46)}/>
        {hover===prop.id&&<Html center position={[0,1.7,0]} style={{pointerEvents:'none'}}><div className="prop-caption">{prop.name}</div></Html>}
      </group>)}
      <Sign text={vertical.name.toUpperCase()} width={Math.min(5,room.w-3)} height={.35} color={vertical.color} ink="#f7f0db" position={[0,.2,room.d/2-1.9]} rotation={[-Math.PI/2,0,0]}/>
      <Plant position={[room.side*(room.w/2-.7),1.34,-room.d/2+.65]} scale={1.3}/>
    </group>
  </group>;
}

function CommonOffice({plan,paused,onAction,pulses}:{plan:OfficePlan;paused:boolean;onAction:(a:WorldAction)=>void;pulses:Partial<Record<WorldAction,number>>}) {
  const {hall,reception:r,lounge:l,meeting:m}=plan;
  return <>
    {plan.walkways.map((r,i)=><Floor key={i} rect={r} color="#dce1d5"/>)}
    <Floor rect={hall} color="#dce1d5"/><Floor rect={r} color="#dce1d5"/><Floor rect={l} color="#e2cfaa" wood/><Floor rect={m} color="#c5d1c8"/>
    {plan.quiet&&<><Floor rect={plan.quiet} color="#d9d9c8" wood/><group position={[plan.quiet.x,.14,plan.quiet.z]}>
      <Box size={[9.3,2.8,.2]} color="#dfe1d3" position={[0,1.4,-plan.quiet.d/2]}/><Sign text="QUIET CORNER" color="#dfe1d3" ink="#668680" width={5.5} height={.6} position={[0,2.3,-plan.quiet.d/2+.12]}/>
      {[-1.9,1.9].map((x,i)=><group key={x} position={[x,0,-plan.quiet!.d/2+1.6]}><Box size={[3.35,.1,2.75]} color="#9ab4aa" position={[0,.08,0]}/><Box size={[.13,2.15,2.7]} color="#6d8b88" position={[-1.62,1.12,0]}/><Box size={[.13,2.15,2.7]} color="#6d8b88" position={[1.62,1.12,0]}/><Box size={[3.35,.12,2.8]} color="#c1b99b" position={[0,2.27,0]}/><Glass size={[3.2,2.1,.07]} position={[0,1.16,1.31]}/><VoxelModel family="sofa" color={i?'#c49b82':'#91afb4'} position={[0,.15,-.4]} scale={1.1}/><Sign text={i?'FOCUS 02':'FOCUS 01'} color="#6d8b88" width={1.6} height={.26} position={[0,2.08,1.36]}/></group>)}
      <Sign text="TAKE A BREATH" color="#d9d9c8" ink="#789a83" width={4.4} height={.5} position={[0,.02,plan.quiet.d/2-1]} rotation={[-Math.PI/2,0,0]}/>
    </group></>}
    <Box size={[.18,.02,hall.d-1]} color="#bc936a" position={[0,.15,hall.z]}/>
    {Array.from({length:Math.floor(hall.d/5)},(_,i)=><Sign key={i} text="›" color="#dce1d5" ink="#869c8e" width={.65} height={.65} position={[1.25,.151,hall.z-hall.d/2+3+i*5]} rotation={[-Math.PI/2,0,Math.PI/2]}/>)}
    <group position={[hall.x,.15,hall.z]}>
      <Box size={[4,.18,4]} color="#738b75" position={[-hall.w/2+2.7,.06,-hall.d/2+2.7]}/>
      <Tree position={[-hall.w/2+2.7,.16,-hall.d/2+2.7]} scale={1.05} paused={paused}/>
      <Box size={[3,.45,.9]} color="#c6ab82" position={[hall.w/2-2,.25,-hall.d/2+1.3]}/>
      <Plant position={[hall.w/2-1.2,.5,-hall.d/2+3]} scale={1.5}/>
      <Fountain position={[0,0,0]} paused={paused} onAction={onAction} pulse={pulses.fountain??0}/>
      <Sign text="THE COMMONS" width={5.5} height={.7} color="#dce1d5" ink="#688476" position={[0,.01,3.3]} rotation={[-Math.PI/2,0,0]}/>
      {[-1,1].map(side=><group key={side} position={[side*(hall.w/2-.7),0,hall.d/2-1]}><Box size={[.13,3.5,.13]} color="#587267" position={[0,1.75,0]}/><mesh position={[0,3.5,0]}><boxGeometry args={[.48,.5,.48]}/><meshStandardMaterial color="#ffe4ae" emissive="#ffd592" emissiveIntensity={1.5}/></mesh></group>)}
    </group>
    <group position={[r.x,0,r.z]}>
      <Box size={[5,1.25,1.7]} color="#86a79b" position={[-2.3,.77,1.2]}/><Box size={[5.18,.16,1.9]} color="#ebcfad" position={[-2.3,1.47,1.2]}/>
      <Sign text="tinyAGENTS" color="#253b58" ink="#fff9ed" width={3.7} height={.48} position={[-2.3,.95,2.061]}/>
      <VoxelModel family="monitor" color="#7b9caa" scale={.46} position={[-3.1,1.57,1.2]}/><VoxelModel family="flowers" color="#e7b881" position={[-.7,1.57,1.2]} scale={.45}/>
      <Box size={[6,.03,1.5]} color="#638c82" position={[1,.17,3.45]}/><Sign text="GOOD THINGS HAPPEN HERE" color="#638c82" width={5} height={.5} position={[1,.19,3.45]} rotation={[-Math.PI/2,0,0]}/>
    </group>
    <group position={[l.x,0,l.z]}>
      <Box size={[l.w,3.1,.2]} color="#e6dec5" position={[0,1.69,-l.d/2]}/><Box size={[l.w,.13,.3]} color="#698881" position={[0,3.29,-l.d/2]}/>
      <Sign text="THE BREAK ROOM" color="#e6dec5" ink="#536e63" width={6} height={.73} position={[0,2.78,-l.d/2+.12]}/>
      <Box size={[9,1.25,1.4]} color="#8dada0" position={[0,.77,-3.7]}/><Box size={[9.2,.14,1.5]} color="#edd4ae" position={[0,1.46,-3.7]}/>
      {[-3,-1,1,3].map(x=><group key={x}><Box size={[1.8,.85,.04]} color="#afc0ae" position={[x,.77,-2.978]}/><Box size={[.5,.05,.06]} color="#647e74" position={[x,1.05,-2.94]}/></group>)}
      <InteractiveProp position={[-2.6,1.55,-3.7]} title="Fresh coffee for the team" icon="☕" onClick={()=>onAction('coffee')}><VoxelModel family="coffee" color="#e5b986" scale={.8}/><CoffeeSteam position={[0,1.4,0]} paused={paused}/></InteractiveProp>
      <VoxelModel family="cake" color="#d99b94" position={[.2,1.55,-3.7]} scale={.7}/><VoxelModel family="plant" color="#ead3a4" position={[3.5,1.55,-3.7]} scale={.7}/>
      <Box size={[2,.05,3.5]} color="#9cbbc1" position={[3.8,.17,1.6]}/><VoxelModel family="sofa" color="#d7a486" position={[3.8,.2,1.6]} rotation={[0,-Math.PI/2,0]} scale={1.55}/>
      <InteractiveProp position={[-4.7,.15,3.9]} title="A tiny high score" icon="🕹️" onClick={()=>onAction('arcade')}><VoxelModel family="arcade" color="#9899c1" scale={1}/></InteractiveProp>
      <InteractiveProp position={[4.8,.15,4.5]} title="Good vibes" icon="🎵" onClick={()=>onAction('music')}><VoxelModel family="speaker" color="#c3a47c" scale={.7}/></InteractiveProp>
      {Object.entries(pulses).filter(([,at])=>Date.now()-at<3000).map(([key])=><Html key={key} position={[-1,3.8,-1]} center><div className="reward-pop">{key==='coffee'?'☕ FRESHLY BREWED':key==='arcade'?'👾 HIGH SCORE!':key==='fountain'?'✨ GREEN TEST ENERGY':'🎵 GOOD VIBES'}</div></Html>)}
    </group>
    <group position={[m.x,0,m.z]}>
      <Box size={[m.w,2.8,.2]} color="#e1e6d7" position={[0,1.54,-m.d/2]}/><Sign text="THE THINK TANK" color="#e1e6d7" ink="#5b7780" width={6} height={.7} position={[0,2.4,-m.d/2+.12]}/>
      <Box size={[.18,.7,m.d]} color="#e4e3d0" position={[-m.w/2,.5,0]}/><Glass size={[.08,1.1,m.d]} position={[-m.w/2,1.4,0]}/>
      <Box size={[4.3,.025,6]} color="#98b6ac" position={[-1,.17,0]}/><Box size={[2.6,.18,4.6]} color="#d8bb96" position={[-1,1.26,0]}/>
      {[-1.8,1.8].map(z=><Box key={z} size={[1.8,1.05,.2]} color="#6a8280" position={[-1,.66,z]}/>)}
      {[-2.75,.75].flatMap((x,i)=>[-1.5,0,1.5].map(z=><VoxelModel key={`${x}:${z}`} family="chair" color="#7d9c9b" position={[x,.15,z]} rotation={[0,i?Math.PI/2:-Math.PI/2,0]} scale={.8}/>))}
      <Whiteboard position={[0,.15,-4.8]} accent="#e1b470"/><VoxelModel family="books" color="#799eb2" position={[-1,1.4,.3]} scale={.45}/><Plant position={[-1,1.4,-1.5]} scale={.4}/>
      <Sign text="SPACE TO THINK" color="#c5d1c8" ink="#78998b" width={4.4} height={.5} position={[0,.16,4.7]} rotation={[-Math.PI/2,0,0]}/>
    </group>

    <Sign text="tinyAGENTS  /  STUDIO FLOOR" color="#e6eee8" ink="#253b58" width={4} height={.55} position={[0,.16,hall.z-hall.d/2+1]} rotation={[-Math.PI/2,0,0]}/>
  </>;
}

function SimulationDriver({simulation,paused,speed}:{simulation:OfficeSimulation;paused:boolean;speed:number}) {
  useFrame((_,dt)=>{if(!paused)simulation.advance(Math.min(dt,.05)*speed)},-2);return null;
}

function CameraRig({plan,focus,action,follow,positions}:{plan:OfficePlan;focus:string|null;action?:CameraAction;follow:string|null;positions:AgentPositions}) {
  const controls=useRef<OrbitControlsImpl>(null),{camera,size}=useThree(),desired=useRef<{target:Vector3;position:Vector3;zoom:number}|null>(null);
  const home=()=>new Vector3(plan.bounds.x,.3,plan.bounds.z),fit=()=>Math.min(size.width/(plan.bounds.w+plan.bounds.d*.6+13),size.height/(plan.bounds.d*.65+plan.bounds.w*.35+14));
  const distant=(offset:Vector3)=>offset.normalize().multiplyScalar(cameraDistance(plan.bounds.w,plan.bounds.d,size.height));
  useEffect(()=>{const cam=camera as OrthographicCamera;cam.near=.1;cam.far=cameraFar(plan.bounds.w,plan.bounds.d,size.height);cam.updateProjectionMatrix();},[camera,plan,size.height]);
  useEffect(()=>{
    const rooms=plan.rooms.filter(r=>r.projectId===focus);
    let target=home(),zoom=fit();
    if(rooms.length){const minX=Math.min(...rooms.map(r=>r.x-r.w/2)),maxX=Math.max(...rooms.map(r=>r.x+r.w/2)),minZ=Math.min(...rooms.map(r=>r.z-r.d/2)),maxZ=Math.max(...rooms.map(r=>r.z+r.d/2));target=new Vector3((minX+maxX)/2,.3,(minZ+maxZ)/2);zoom=Math.min(size.width/(maxX-minX+(maxZ-minZ)*.55+9),size.height/((maxZ-minZ)*.7+(maxX-minX)*.35+8));}
    desired.current={target,position:target.clone().add(distant(new Vector3(25,37,36))),zoom};
  },[focus,plan,size.width,size.height]);
  useEffect(()=>{if(!action||!controls.current)return;const cam=camera as OrthographicCamera,target=action.type==='home'?home():controls.current.target.clone(),offset=camera.position.clone().sub(target);if(action.type==='rotate')offset.applyAxisAngle(new Vector3(0,1,0),Math.PI/2);desired.current={target,position:action.type==='home'?target.clone().add(distant(new Vector3(25,37,36))):target.clone().add(distant(offset)),zoom:action.type==='home'?fit():action.type==='in'||action.type==='out'?MathUtils.clamp(cam.zoom*(action.type==='in'?1.25:.8),5,140):cam.zoom};},[action]);
  useFrame((_,dt)=>{if(follow&&positions.has(follow)){const target=positions.get(follow)!.clone().add(new Vector3(0,.8,0));desired.current={target,position:target.clone().add(distant(new Vector3(12,13,17))),zoom:Math.min(size.width/15,size.height/13)};}if(!desired.current||!controls.current)return;const d=desired.current,blend=1-Math.exp(-dt*4),cam=camera as OrthographicCamera;camera.position.lerp(d.position,blend);controls.current.target.lerp(d.target,blend);cam.zoom=MathUtils.lerp(cam.zoom,d.zoom,blend);cam.updateProjectionMatrix();controls.current.update();camera.updateMatrixWorld();if(camera.position.distanceTo(d.position)<.01&&Math.abs(cam.zoom-d.zoom)<.02)desired.current=null;},-1);
  return <OrbitControls ref={controls} makeDefault enableDamping screenSpacePanning={false} minZoom={4} maxZoom={150} minPolarAngle={.2} maxPolarAngle={Math.PI/2.35} onStart={()=>{desired.current=null}}/>;
}

export default function OfficeScene({projects,selected,onSelect,reaction,now,paused,reducedMotion,focus,action,evening,daylight=evening?0:1,events=[],speed=1,follow=null,designs={},onWorldAction,pulses={},onFocus,hangout,onHangoutResult}:{projects:Project[];selected?:string;onSelect:(a:Agent)=>void;reaction?:Reaction;now:number;paused:boolean;reducedMotion:boolean;focus:string|null;action?:CameraAction;evening:boolean;daylight?:number;events?:OfficeEvent[];speed?:number;follow?:string|null;designs?:Designs;onWorldAction:(a:WorldAction)=>void;pulses?:Partial<Record<WorldAction,number>>;onFocus:(id:string)=>void;hangout?:Hangout;onHangoutResult:(text:string)=>void}) {
  const signature=projects.map(p=>`${p.id}:${p.name}:${p.agents.map(a=>`${a.key}:${a.parentAgentId??''}`).join(',')}`).join('|');
  const prior=useRef<OfficeSimulation | undefined>(undefined);
  const plan=useMemo(()=>officePlan(projects),[signature]),simulation=useMemo(()=>new OfficeSimulation(plan,prior.current),[plan]);
  useEffect(()=>{prior.current=simulation},[simulation]);
  const agents=useMemo(()=>new Map(projects.flatMap(p=>p.agents).map(a=>[a.key,a])),[projects]);
  const positions=useMemo<AgentPositions>(()=>new Map(),[]),[contextLost,setContextLost]=useState(false),still=paused||reducedMotion;
  useEffect(()=>simulation.sync([...agents.values()],now),[simulation,agents,now]);
  const [socialCast,setSocialCast]=useState<string[]>([]);
  useEffect(()=>{
    if(!hangout)return;
    if(still){onHangoutResult('Resume the simulation with motion enabled to start a hangout.');return;}
    const resting=[...agents.values()].filter(a=>['idle','done'].includes(effectiveState(a,now)));
    const first=resting.find(a=>!a.visitingOfficeId)??resting[0];
    const second=first&&resting.find(a=>(a.visitingOfficeId??'home')!==(first.visitingOfficeId??'home'));
    if(!first||!second){setSocialCast([]);onHangoutResult('Everyone is busy. Try a hangout when two offices have someone between tasks.');return;}
    const cast=[first.key,second.key];
    const count=simulation.gather(cast,hangout.kind);
    setSocialCast(count===2?cast:[]);
    onHangoutResult(count===2?`${hangouts[hangout.kind].icon} ${first.name} + ${second.name}: ${hangouts[hangout.kind].line}`:'The shared area is busy. Try again after the current break.');
  },[hangout?.at]);
  const b=plan.bounds;
  const {conversations,talks}=useConversations(events,agents,simulation,now,still);
  return <div className="office-canvas"><Canvas shadows="percentage" orthographic camera={{position:[625,925,900],zoom:20,near:.1,far:10000}} dpr={[1,1.6]} gl={{antialias:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.domElement.addEventListener('webglcontextlost',()=>setContextLost(true));gl.domElement.addEventListener('webglcontextrestored',()=>setContextLost(false));}}>
    <color attach="background" args={[new Color('#344b60').lerp(new Color('#b6cbc0'),daylight)]}/>
    <ambientLight intensity={.45+daylight*.25} color={evening?'#bdc9e7':'#fff7e6'}/><hemisphereLight args={['#ecf2f4','#a4a88d',.5+daylight*.35]}/>
    <directionalLight position={[-25,45,25]} intensity={.65+daylight*1.25} color={evening?'#ffcc99':'#ffedd0'} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-normalBias={.035}/>
    <mesh position={[b.x,-.66,b.z]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[20000,20000]}/><meshStandardMaterial color={new Color('#2c4654').lerp(new Color('#a9c0b4'),daylight)} roughness={1}/></mesh>
    <Suspense fallback={null}>
      <SimulationDriver simulation={simulation} paused={still} speed={speed}/>

      {evening&&[plan.hall,plan.lounge,plan.meeting].map((r,i)=><pointLight key={i} position={[r.x,4,r.z]} color="#ffe0aa" intensity={9} distance={18} decay={1.5}/>)}
      <CommonOffice plan={plan} paused={still} onAction={onWorldAction} pulses={pulses}/>
      {plan.rooms.map(room=><ProjectRoom key={room.id} room={room} design={designs[room.projectId]} agents={agents} now={now} simulation={simulation} paused={still} night={evening} onFocus={()=>onFocus(room.projectId)} mark={String(projects.findIndex(p=>p.id===room.projectId)+1).padStart(2,'0')}/>)}
      {[...agents.values()].map((agent,i)=><Character key={agent.key} agent={agent} state={effectiveState(agent,now)} index={agent.name.charCodeAt(0)+i} selected={selected===agent.key} onSelect={()=>onSelect(agent)} reaction={reaction?.key===agent.key?reaction:undefined} paused={paused} reducedMotion={reducedMotion} speed={speed} positions={positions} simulation={simulation} projectColor={projectColor(agent.project.id)} projectMark={String(projects.findIndex(p=>p.id===agent.project.id)+1).padStart(2,'0')} role={agentRole(agent,[...agents.values()])} talkPartner={talks[agent.key]?.partner} socialLabel={hangout&&socialCast.includes(agent.key)&&now-hangout.at<18000&&['idle','done'].includes(effectiveState(agent,now))?`${hangouts[hangout.kind].icon} ${hangouts[hangout.kind].name}`:talks[agent.key]?.label}/>)}
      {!reducedMotion&&<TeamSignals conversations={conversations} positions={positions} paused={paused}/>}
      {[-1,1].map(side=><group key={side}><Tree position={[b.x+side*(b.w/2+1.8),-.47,b.z-b.d/2+2]} scale={1.25} pink={side<0} paused={still}/><Tree position={[b.x+side*(b.w/2+1.8),-.47,b.z+b.d/2-3]} scale={1.45} paused={still}/></group>)}
      <Box size={[7,.2,2]} color="#e0d4b9" position={[plan.reception.x,-.16,plan.reception.z+plan.reception.d/2+.9]}/>
    </Suspense>
    <CameraRig plan={plan} focus={focus} action={action} follow={follow} positions={positions}/>
  </Canvas>{contextLost&&<div className="canvas-fallback">The world is reconnecting…</div>}</div>;
}
