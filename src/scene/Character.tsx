import { useEffect, useRef, useState } from 'react';
import { GameBubble } from './GameLabels';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils, Vector3 } from 'three';
import { VoxelModel } from './VoxelModel';
import { Box } from './Props';
import { Sign } from './WorldProps';
import { ReactionBurst, StatePulse, Footsteps } from './Effects';
import { stateMeta, type Agent, type AgentState } from '../../shared/protocol';
import type { OfficeSimulation } from '../../shared/simulation';
export type Reaction = { key: string; kind: 'poke' | 'snack' | 'cheer'; at: number };
export type AgentPositions = Map<string, Vector3>;

export function Character({ agent, state, index, selected, onSelect, reaction, paused, reducedMotion, speed, positions, simulation, projectColor, projectMark, role, socialLabel, talkPartner }: {
  agent: Agent; state: AgentState; index: number; selected: boolean; onSelect: () => void; reaction?: Reaction;
  paused: boolean; reducedMotion: boolean; speed: number; positions: AgentPositions; simulation: OfficeSimulation;
  projectColor: string; projectMark: string; role: string; socialLabel?: string; talkPartner?:string;
}) {
  const root = useRef<Group>(null), body = useRef<Group>(null), head = useRef<Group>(null);
  const arms = useRef<(Group | null)[]>([]), elbows = useRef<(Group | null)[]>([]), legs = useRef<(Group | null)[]>([]), knees = useRef<(Group | null)[]>([]);
  const coffee = useRef<Group>(null), book = useRef<Group>(null), time = useRef(index * 1.73), sitting = useRef(1);
  const [hovered, setHovered] = useState(false), [transition, setTransition] = useState(0), last = useRef(state);
  useEffect(() => {
    if(last.current===state)return;
    // Tool start/finish alternates work and thinking many times a minute.
    // Save the big feedback for changes the owner needs to notice.
    if(['waiting','blocked','done'].includes(state))setTransition(Date.now());
    else setTransition(0);
    last.current=state;
  }, [state]);
  useEffect(() => () => { positions.delete(agent.key); }, [agent.key, positions]);
  const shirt = agent.provider === 'codex' ? ['#327f85','#4b6e9b','#438b6e'][index % 3] : ['#cf7959','#aa665d','#c39549'][index % 3];
  const skin = ['#e9b897','#be8762','#ecc5a2','#9d704f'][index % 4];
  useFrame((_, delta) => {
    const sim = simulation.bodies.get(agent.key);
    if (!sim || !root.current || !body.current || !head.current) return;
    root.current.position.set(sim.x, .18, sim.z); root.current.rotation.y = sim.angle;
    if (!positions.has(agent.key)) positions.set(agent.key, new Vector3());
    positions.get(agent.key)!.copy(root.current.position);
    body.current.visible = sim.phase !== 'away';
    if (paused) return;
    const dt = Math.min(delta, .05) * speed, calm = reducedMotion, t = time.current += calm ? 0 : dt;
    const walk = Math.min(1, sim.travel / 1.5), stride = sim.gait;
    sitting.current = MathUtils.damp(sitting.current, sim.phase === 'desk' ? 1 : 0, 7, dt);
    const sit = sitting.current, atDesk = sit > .7;
    const reactionAge = reaction ? (Date.now() - reaction.at) / 1000 : 10;
    const reacting = reactionAge < 2.6;
    const finish = state === 'done' && sim.age < 3;
    const celebrate = !calm && (finish || reacting && reaction?.kind === 'cheer');
    const hop = celebrate ? Math.max(0, Math.sin((reacting ? reactionAge : sim.age) * 6.3)) * .27 : 0;
    body.current.position.y = .16 * sit + (calm ? 0 : Math.abs(Math.sin(stride)) * .038 * walk + Math.sin(t * 1.8) * .012) + hop;
    body.current.rotation.z = calm ? 0 : Math.sin(stride) * .035 * walk;
    body.current.rotation.x = MathUtils.damp(body.current.rotation.x, atDesk && state === 'blocked' ? .15 : walk * .05, 7, dt);
    head.current.rotation.x = MathUtils.damp(head.current.rotation.x, state === 'blocked' ? .24 : state === 'reading' ? .14 : state === 'thinking' ? -.12 : -.03, 5, dt);
    const partner=talkPartner?simulation.bodies.get(talkPartner):undefined;
    const chatting=!!partner&&sim.phase!=='walking';
    const talkAngle=partner?Math.atan2(partner.x-sim.x,partner.z-sim.z)-sim.angle:0;
    head.current.rotation.y = MathUtils.damp(head.current.rotation.y, chatting ? MathUtils.clamp(Math.atan2(Math.sin(talkAngle),Math.cos(talkAngle)),-.9,.9) : reacting ? -.25 : calm ? 0 : atDesk ? Math.sin(t * .85) * .09 : Math.sin(t * .55) * .2, 6, dt);
    head.current.rotation.z = MathUtils.damp(head.current.rotation.z, state === 'thinking' ? -.12 : reacting && reaction?.kind === 'poke' ? .2 : 0, 7, dt);
    for (let side = 0; side < 2; side++) {
      const arm = arms.current[side], elbow = elbows.current[side], leg = legs.current[side], knee = knees.current[side];
      if (!arm || !elbow || !leg || !knee) continue;
      const sign = side ? 1 : -1, swing = Math.sin(stride + side * Math.PI);
      leg.rotation.x = MathUtils.damp(leg.rotation.x, -1.35 * sit + swing * .52 * walk, 13, dt);
      knee.rotation.x = MathUtils.damp(knee.rotation.x, 1.5 * sit + Math.max(0, -swing) * .7 * walk, 13, dt);
      let ax = -.12 - swing * .48 * walk, az = sign * -.08, ex = -.12;
      if (atDesk) {
        if (state === 'coding') { ax = -.7 + (calm ? 0 : Math.sin(t * 11 + side * 2) * .055); ex = -.75 + (calm ? 0 : Math.sin(t * 15 + side * 3) * .09); }
        if (state === 'testing') { ax = side ? -.72 : -.3; ex = side ? -.8 + Math.sin(t * 3) * .04 : -.65; }
        if (state === 'reading') { ax = -.45; ex = -1.05; }
        if (state === 'thinking') { ax = side ? -.78 : -.15; ex = side ? -1.55 : -.4; }
        if (state === 'blocked') { ax = side ? -1.05 : -.65; ex = side ? -1.4 : -.75; }
        if (state === 'waiting' && t % 9 < 2.1 && !calm) { ax = -.2; az = side ? -2.25 + Math.sin(t * 8) * .13 : .08; ex = -.6; }
      }
      if (sim.phase === 'break' && side) { ax = -.55; ex = -1.3 + (calm ? 0 : Math.sin(t * .9) * .3); }
      if (reacting && reaction?.kind === 'snack' && side) { ax = -.65; ex = -1.65 + Math.sin(t * 4) * .1; }
      if (reacting && reaction?.kind === 'poke' && side) { az = -1.25; ex = -.6; }
      if(chatting&&!calm&&side){ax=-.55+Math.sin(t*3)*.16;ex=-.9;az=-.25-Math.sin(t*2)*.12;}
      if (celebrate) { ax = -.1; az = side ? -2.5 : 2.5; ex = -.35; }
      arm.rotation.x = MathUtils.damp(arm.rotation.x, ax, 11, dt); arm.rotation.z = MathUtils.damp(arm.rotation.z, az, 11, dt); elbow.rotation.x = MathUtils.damp(elbow.rotation.x, ex, 11, dt);
    }
    if (coffee.current) coffee.current.visible = sim.phase === 'break' && !reacting;
    if (book.current) book.current.visible = state === 'reading' && atDesk;
  });
  const showingReaction = reaction && Date.now() - reaction.at < 3000;
  const changed = transition > 0 && Date.now() - transition < 3000;
  return <group ref={root} onClick={e => { e.stopPropagation(); onSelect(); }} onPointerOver={e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.009,0]}><ringGeometry args={[.48,.55,32]}/><meshBasicMaterial color={projectColor} transparent opacity={.75}/></mesh>
    {(selected || hovered) && <mesh rotation={[-Math.PI / 2,0,0]} position={[0,.012,0]}><ringGeometry args={[.56,.65,40]}/><meshBasicMaterial color="#ffe59b" transparent opacity={.9}/></mesh>}
    <group ref={body}>
      {[0,1].map(side => <group key={side} ref={r => { legs.current[side] = r; }} position={[side ? .2 : -.2,.62,0]}>
        <Box size={[.25,.3,.28]} color="#364755" position={[0,-.15,0]}/>
        <group ref={r => { knees.current[side] = r; }} position={[0,-.29,0]}><Box size={[.23,.27,.25]} color="#364755" position={[0,-.13,0]}/><Box size={[.29,.13,.42]} color="#f2e6ce" position={[0,-.32,.08]}/><Box size={[.3,.055,.42]} color={shirt} position={[0,-.4,.08]}/></group>
      </group>)}
      <VoxelModel family="character-body" color={shirt} variant={index} position={[0,.55,0]} scale={1.1}/>
      <group ref={head} position={[0,1.33,0]}><VoxelModel family="character-head" color={shirt} variant={index} scale={1.1}/></group>
      {[0,1].map(side => <group key={side} ref={r => { arms.current[side] = r; }} position={[side ? .43 : -.43,1.16,0]}>
        <Box size={[.25,.34,.26]} color={shirt} position={[0,-.17,0]}/>
        <group ref={r => { elbows.current[side] = r; }} position={[0,-.33,0]}><Box size={[.22,.22,.24]} color={shirt} position={[0,-.1,0]}/><Box size={[.21,.17,.24]} color={skin} position={[0,-.27,0]}/>
          {side === 1 && <><group ref={coffee} visible={false} position={[0,-.32,.1]}><VoxelModel family="mug" color="#eac97c" scale={.27}/></group>{showingReaction && reaction?.kind === 'snack' && <VoxelModel family="cake" color="#e3ae64" position={[0,-.32,.1]} scale={.25}/>}</>}
          {side === 0 && <group ref={book} visible={false} position={[.2,-.26,.1]} rotation={[-.6,0,0]}><Box size={[.63,.08,.44]} color="#e6c774"/><Box size={[.58,.025,.4]} color="#fff4dd" position={[0,.055,0]}/></group>}
        </group>
      </group>)}
      <Box size={[.09,.18,.31]} color={projectColor} position={[-.48,1.13,0]}/>
      <Sign text={`${agent.provider==='codex'?'⌘':'✳'} ${projectMark}`} color={projectColor} ink="#fff8e0" width={.4} height={.25} position={[.12,1.05,.31]}/>
      {role==='Team lead' && <Sign text="★" color="#eec96a" ink="#715221" width={.22} height={.22} position={[.24,1.36,.31]}/>}
      {agent.parentAgentId && <Sign text="↳" color="#e3e9dc" ink="#476a69" width={.21} height={.2} position={[-.19,1.07,.31]}/>}
    </group>
    {!reducedMotion && <Footsteps bodyKey={agent.key} simulation={simulation} paused={paused}/>}
    {!reducedMotion && changed && <StatePulse at={transition} color={stateMeta[state].color} paused={paused}/>}
    {!reducedMotion && (showingReaction || changed && state === 'done') && <ReactionBurst at={reaction?.at ?? transition} kind={reaction?.kind ?? 'cheer'} paused={paused}/>}
    <GameBubble compact={!(selected||hovered||showingReaction||socialLabel)} attention={state==='waiting'||state==='blocked'} text={socialLabel || (showingReaction ? reaction?.kind === 'snack' ? '🍪 nom!' : reaction?.kind === 'poke' ? '👀 hey, you' : '💛 thank you!' : selected||hovered ? `${stateMeta[state].emoji} ${stateMeta[state].label}` : stateMeta[state].emoji)}/>
    {(selected||hovered)&&<GameBubble nameplate position={[0,3.7,0]} text={`${role==='Team lead'?'★':agent.parentAgentId?'↳':agent.provider==='codex'?'⌘':'✳'} ${agent.name} · ${projectMark}`}/>}

  </group>;
}
