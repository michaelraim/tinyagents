import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, Euler, Group, MathUtils, Mesh, Quaternion, type AnimationAction, type Object3D } from 'three';
import { mat, sphere, roundedBox } from './kit';
import { characterVariants, useCharacter, type CharacterVariant } from './assets';
import type { Body, World } from './sim';
import type { Agent } from '../../shared/protocol';

export type Look = { variant: CharacterVariant; lead: boolean; junior: boolean; provider: Agent['provider']; headset: boolean };

export function lookFor(agent: Agent, lead: boolean): Look {
  let h = 2166136261;
  for (let i = 0; i < agent.key.length; i++) h = Math.imul(h ^ agent.key.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return {
    variant: characterVariants[n % characterVariants.length],
    lead, junior: !!agent.parentAgentId && !lead, provider: agent.provider,
    headset: lead || n % 5 === 0,
  };
}

const SEATED = new Set(['type', 'think', 'read', 'test', 'stuck', 'doze', 'idle', 'relax', 'phone', 'sip', 'lounge']);
const MUG = new Set(['coffee', 'sip', 'chat', 'gaze']);
/** Characters are scaled a little smaller than the furniture so they sit at desks believably. */
const CHARACTER_SCALE = 1.42;
const SEAT_LIFT = 0.34 / CHARACTER_SCALE;
const POSED = ['arm-left', 'arm-right', 'head', 'torso'] as const;
type BoneName = typeof POSED[number];
type Pose = Partial<Record<BoneName, [number, number, number]>>;

/** Which baked clip plays underneath each action. */
function clipFor(action: string, seated: boolean): string {
  if (action === 'walk') return 'walk';
  if (seated) return 'sit';
  if (action === 'celebrate') return 'jump';
  if (['play-pong', 'pace'].includes(action)) return 'interact-right';
  return 'idle';
}

// Rest is a T-pose. Right arm: +z lowers, -z raises, +y swings forward; the left arm mirrors.
const typing = (t: number): Pose => ({
  'arm-right': [0, 1.35, 0.45 + Math.sin(t * 22) * 0.08],
  'arm-left': [0, -1.35, -0.45 - Math.sin(t * 22 + 1.6) * 0.08],
  head: [0.12 + Math.sin(t * 2) * 0.04, 0, 0],
  torso: [0.12, 0, 0],
});

function poseFor(action: string, t: number, reaction?: string, rt = 0, carry?: string): Pose {
  if (carry && (action === 'walk' || action === 'idle' || action === 'chat')) return { 'arm-right': [0, 1.45, 0.25], 'arm-left': [0, -1.45, -0.25] };
  if (reaction === 'snack') return { 'arm-right': [0, 1.0, -0.4 + Math.sin(rt * 14) * 0.15], head: [-0.1, 0, 0] };
  if (reaction === 'highfive') return { 'arm-right': [0, 0.3, -1.45] };
  if (reaction === 'cheer') return { 'arm-right': [0, 0.2, -1.3 + Math.sin(rt * 16) * 0.2], 'arm-left': [0, -0.2, 1.3 - Math.sin(rt * 16) * 0.2] };
  if (reaction === 'poke') return { head: [0, 0, Math.sin(rt * 30) * 0.3 * Math.max(0, 1 - rt / 1.4)], torso: [-0.15, 0, 0] };
  switch (action) {
    case 'type': return typing(t);
    case 'test': return { ...typing(t * 0.4), head: [0.05, Math.sin(t * 1.5) * 0.15, 0] };
    case 'read': return { 'arm-right': [0, 1.1, 0.7], 'arm-left': [0, -1.1, -0.7], head: [0.32, Math.sin(t * 0.6) * 0.2, 0] };
    case 'think': return { 'arm-right': [0, 1.0, -0.55], 'arm-left': [0, -0.5, -1.2], head: [-0.15, 0, Math.sin(t * 0.8) * 0.18], torso: [-0.1, 0, 0] };
    case 'wave': return { 'arm-right': [0, 0.25, -1.3 + Math.sin(t * 12) * 0.35], head: [-0.1, 0, Math.sin(t * 6) * 0.08] };
    case 'stuck': return { 'arm-right': [0, 0.9, -1.15], 'arm-left': [0, -0.9, 1.15], head: [0.35, Math.sin(t * 2.6) * 0.3, 0], torso: [0.25, 0, 0] };
    case 'doze': return { 'arm-right': [0, 1.2, 0.6], 'arm-left': [0, -1.2, -0.6], head: [0.6, 0, 0.25], torso: [0.35, 0, 0] };
    case 'celebrate': return { 'arm-right': [0, 0.2, -1.35 + Math.sin(t * 14) * 0.2], 'arm-left': [0, -0.2, 1.35 - Math.sin(t * 14) * 0.2] };
    case 'relax': return { 'arm-right': [0, -0.35, -1.25], 'arm-left': [0, 0.35, 1.25], head: [-0.25, 0, 0], torso: [-0.22, 0, 0] };
    case 'phone': return { 'arm-right': [0, 1.2, 0.2], 'arm-left': [0, -1.2, -0.2], head: [0.35, 0, 0] };
    case 'coffee': case 'sip': case 'gaze': {
      const sip = Math.sin(t * 0.9) > 0.55;
      return { 'arm-right': sip ? [0, 1.1, -0.6] : [0, 0.9, 0.55], head: sip ? [-0.15, 0, 0] : [0, 0, 0] };
    }
    case 'chat': return { 'arm-right': [0, 0.9, 0.55], 'arm-left': [0, -0.6 - Math.sin(t * 3) * 0.4, -0.6], head: [Math.sin(t * 4) * 0.08, 0, 0] };
    case 'lounge': return { torso: [-0.25, 0, 0], head: [-0.1, 0, 0.15] };
    case 'pace': return { 'arm-right': [0, 1.3, -0.3 + Math.sin(t * 4) * 0.25] };
    case 'play-arcade': return { 'arm-right': [0, 1.3, 0.35 + Math.sin(t * 25) * 0.1], 'arm-left': [0, -1.3, -0.35 - Math.sin(t * 19) * 0.12] };
    default: return {};
  }
}

const gemColor: Record<string, string> = {
  type: '#46e08a', read: '#46e08a', test: '#3ee8ff', think: '#b06bff', pace: '#b06bff',
  wave: '#ffb020', stuck: '#ff4f6d', doze: '#7a7f99', celebrate: '#ffd23f',
};
const GEM_HIDDEN = new Set(['walk', 'idle', 'relax', 'lounge', 'coffee', 'sip', 'chat', 'gaze', 'phone', 'play-pong', 'play-arcade']);

function box(w: number, h: number, d: number, color: string, glow = false) {
  const mesh = new Mesh(roundedBox(0.3), mat(color, glow ? { emissive: color, glow: 0.4, rough: 0.4 } : { rough: 0.6 }));
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  return mesh;
}

/** Lanyard badge on the chest: terracotta for Claude Code, white for Codex. */
function badge(provider: Agent['provider']) {
  const group = new Group();
  const color = provider === 'claude' ? '#d97757' : '#f2f2f2';
  const strap = box(0.012, 0.09, 0.004, color); strap.position.set(0, 0.08, 0.1);
  const tag = box(0.05, 0.065, 0.01, color, true); tag.position.set(0, 0.022, 0.106);
  group.add(strap, tag);
  return group;
}

function headset(lead: boolean) {
  const group = new Group();
  const accent = lead ? '#ffd23f' : '#3ee8ff';
  const band = box(0.3, 0.025, 0.04, '#24263a'); band.position.set(0, 0.29, 0);
  const left = box(0.035, 0.09, 0.09, accent, true); left.position.set(0.16, 0.18, 0);
  const right = box(0.035, 0.09, 0.09, accent, true); right.position.set(-0.16, 0.18, 0);
  const mic = box(0.012, 0.012, 0.12, '#24263a'); mic.position.set(-0.15, 0.12, 0.08); mic.rotation.y = 0.5;
  group.add(band, left, right, mic);
  return group;
}

const euler = new Euler(), target = new Quaternion(), offset = new Quaternion();

/**
 * A Kenney mini character driven by the shared World. React renders it once; all
 * motion happens per frame: baked clips crossfade underneath, hand-tuned bone poses
 * layer on top for typing, thinking, waving and despair.
 */
export function Person({ agent, look, world, onSelect, onPoke }: {
  agent: Agent; look: Look; world: World; onSelect: (key: string) => void; onPoke: (key: string) => void;
}) {
  const { scene, animations } = useCharacter(look.variant);
  const root = useRef<Group>(null);
  const bounce = useRef<Group>(null);
  const gem = useRef<Group>(null);
  const turn = useRef(0);
  const gemMaterial = useMemo(() => mat('#46e08a', { emissive: '#46e08a', glow: 1.2, rough: 0.2 }).clone(), []);
  const mug = useRef<Group>(null), phone = useRef<Group>(null), cookie = useRef<Group>(null);
  const zzz = useRef<Group>(null);
  const carryBox = useRef<Group>(null), carryPizza = useRef<Group>(null), carryReport = useRef<Group>(null);
  const state = useRef<{ clip?: string; weights: Record<string, number> }>({ weights: {} });

  const { mixer, actions, bones, rest } = useMemo(() => {
    const mixer = new AnimationMixer(scene);
    const actions = new Map<string, AnimationAction>();
    for (const clip of animations) actions.set(clip.name, mixer.clipAction(clip));
    const bones: Partial<Record<BoneName, Object3D>> = {};
    scene.traverse(o => { if ((POSED as readonly string[]).includes(o.name)) bones[o.name as BoneName] = o; });
    // Rest rotations: clips don't animate every bone, so poses are applied on top of these.
    const rest = Object.fromEntries(Object.entries(bones).map(([name, bone]) => [name, bone!.quaternion.clone()])) as Partial<Record<BoneName, Quaternion>>;
    return { mixer, actions, bones, rest };
  }, [scene, animations]);

  // Hand props ride on the right arm; badge and headset on torso and head.
  useEffect(() => {
    const arm = bones['arm-right'];
    for (const prop of [mug.current, phone.current, cookie.current]) if (arm && prop) arm.add(prop);
    const extras: Object3D[] = [];
    if (bones.torso) { const b = badge(look.provider); bones.torso.add(b); extras.push(b); }
    if (bones.head && look.headset) { const h = headset(look.lead); bones.head.add(h); extras.push(h); }
    return () => { for (const e of extras) e.removeFromParent(); };
  }, [bones, look]);

  useFrame(({ clock }, rawDt) => {
    const b: Body | undefined = world.bodies.get(agent.key);
    const g = root.current;
    if (!g) return;
    if (!b) { g.visible = false; return; }
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime + b.seed * 10;
    g.visible = b.phase !== 'gone' && b.visible > 0.02;
    if (!g.visible) return;

    const atSofa = b.phase === 'at-spot' && b.goal.kind === 'spot' && b.goal.spot.sit;
    const seated = (b.phase === 'seated' && SEATED.has(b.action)) || atSofa;
    const standOffset = b.phase === 'seated' && !seated ? 0.5 : 0;
    const sofaOffset = atSofa && b.goal.kind === 'spot' ? b.goal.spot.back : 0;
    const back = b.angle + Math.PI, off = standOffset + sofaOffset;
    g.position.set(b.x + Math.sin(back) * off, 0, b.z + Math.cos(back) * off);
    // Not working: the chair swivels away from the screen.
    const swivel = b.phase === 'seated' && (b.action === 'relax' || b.action === 'phone') ? (b.seed > 0.5 ? 0.7 : -0.7) : 0;
    turn.current += (swivel - turn.current) * (1 - Math.exp(-dt * 4));
    g.rotation.y = b.angle + turn.current;

    // Pop in on arrival; squash and stretch on reactions.
    const reacting = b.reaction && performance.now() - b.reaction.at < 1400 ? b.reaction : undefined;
    const rt = reacting ? (performance.now() - reacting.at) / 1000 : 0;
    const squash = reacting ? Math.sin(Math.min(rt * 10, Math.PI)) * 0.18 * Math.max(0, 1 - rt) : 0;
    const size = (look.junior ? 0.86 : look.lead ? 1.06 : 1) * CHARACTER_SCALE * Math.min(1, b.visible * 1.25);
    g.scale.set(size * (1 + squash * 0.5), size * (1 - squash * 0.4), size * (1 + squash * 0.5));

    // Baked clip crossfade.
    const s = state.current;
    const clip = clipFor(b.action, seated);
    if (s.clip !== clip) {
      const next = actions.get(clip), prev = s.clip ? actions.get(s.clip) : undefined;
      next?.reset().fadeIn(0.25).play();
      prev?.fadeOut(0.25);
      s.clip = clip;
    }
    const walk = actions.get('walk');
    if (walk) walk.timeScale = MathUtils.clamp(b.speed / 1.6, 0.6, 1.6);
    // Reset posed bones first so last frame's pose never compounds.
    for (const name of POSED) { const bone = bones[name], q = rest[name]; if (bone && q) bone.quaternion.copy(q); }
    mixer.update(dt);

    // Hand-tuned pose layer on top of the clip.
    const pose = poseFor(b.action, t, reacting?.kind, rt, b.carry);
    for (const name of POSED) {
      const bone = bones[name];
      if (!bone) continue;
      const w = s.weights[name] = MathUtils.damp(s.weights[name] ?? 0, pose[name] ? 1 : 0, 12, dt);
      if (w < 0.001) continue;
      const [x, y, z] = pose[name] ?? [0, 0, 0];
      // Arms are posed from the T-pose rest; head and torso add to the clip.
      if (name.startsWith('arm')) target.setFromEuler(euler.set(x, y, z));
      else target.copy(bone.quaternion).multiply(offset.setFromEuler(euler.set(x, y, z)));
      bone.quaternion.slerp(target, w);
    }

    if (bounce.current) {
      const hop = b.action === 'celebrate' ? Math.abs(Math.sin(t * 7)) * 0.18 : b.action === 'wave' ? Math.max(0, Math.sin(t * 6)) * 0.04 : 0;
      const pokeHop = reacting?.kind === 'poke' ? Math.sin(Math.min(rt * 9, Math.PI)) * 0.2 : 0;
      // Kenney's sit clip puts the hips at floor level; lift onto the chair seat (Kenney units).
      bounce.current.position.y = hop + pokeHop + (seated ? SEAT_LIFT : 0);
    }
    if (mug.current) mug.current.visible = MUG.has(b.action) && !reacting;
    if (phone.current) phone.current.visible = b.action === 'phone';
    if (cookie.current) cookie.current.visible = reacting?.kind === 'snack';
    if (carryBox.current) carryBox.current.visible = b.carry === 'box';
    if (carryPizza.current) carryPizza.current.visible = b.carry === 'pizza';
    if (carryReport.current) carryReport.current.visible = b.carry === 'report';

    // Sims-style status gem, in character-local (Kenney) units.
    if (gem.current) {
      const color = gemColor[b.action] ?? '#9aa3b2';
      gemMaterial.color.set(color); gemMaterial.emissive.set(color);
      const urgent = b.action === 'wave' || b.action === 'stuck';
      gem.current.visible = urgent || !GEM_HIDDEN.has(b.action);
      gem.current.rotation.y += dt * (urgent ? 5 : 1.6);
      gem.current.position.y = (seated ? 0.8 : 0.9) + Math.sin(t * 2.4) * 0.02;
      gem.current.scale.setScalar(urgent ? 1.2 + Math.sin(t * 8) * 0.15 : 0.8);
    }
    if (zzz.current) {
      zzz.current.visible = b.action === 'doze';
      zzz.current.children.forEach((c, i) => {
        const p = (t * 0.5 + i / 3) % 1;
        c.position.set(0.1 + p * 0.15, 0.5 + p * 0.3, 0);
        c.scale.setScalar(0.025 + p * 0.025);
      });
    }
  });

  return (
    <group ref={root}
      onClick={e => { e.stopPropagation(); onSelect(agent.key); }}
      onDoubleClick={e => { e.stopPropagation(); onPoke(agent.key); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <group ref={bounce}><primitive object={scene} /></group>
      {/* Hand props (Kenney units), re-parented onto the right arm at mount. */}
      <group ref={mug} visible={false} position={[-0.2, -0.01, 0.04]}>
        <mesh geometry={roundedBox(0.3)} material={mat('#ffffff')} scale={[0.05, 0.065, 0.05]} castShadow />
        <mesh geometry={roundedBox(0.3)} material={mat('#5a3825')} position={[0, 0.03, 0]} scale={[0.042, 0.008, 0.042]} />
      </group>
      <group ref={phone} visible={false} position={[-0.21, 0, 0.04]} rotation={[0, 0, 0.3]}>
        <mesh geometry={roundedBox(0.3)} material={mat('#1f2430', { emissive: '#3ee8ff', glow: 0.25 })} scale={[0.04, 0.075, 0.012]} />
      </group>
      <group ref={cookie} visible={false} position={[-0.21, 0, 0.05]}>
        <mesh geometry={sphere(10)} material={mat('#c98b4a')} scale={[0.07, 0.02, 0.07]} />
      </group>
      {/* Carried things, held out in front at chest height (Kenney units). */}
      <group ref={carryBox} visible={false} position={[0, 0.3, 0.2]}>
        <mesh geometry={roundedBox(0.1)} material={mat('#c9955a')} scale={[0.2, 0.15, 0.16]} castShadow />
        <mesh geometry={roundedBox(0.1)} material={mat('#e2c08a')} position={[0, 0.076, 0]} scale={[0.205, 0.01, 0.04]} />
        <mesh geometry={roundedBox(0.3)} material={mat('#3ee8ff', { emissive: '#3ee8ff', glow: 0.6 })} position={[0.04, 0.09, 0.02]} scale={[0.03, 0.05, 0.03]} />
      </group>
      <group ref={carryPizza} visible={false} position={[0, 0.32, 0.2]}>
        {[0, 1, 2].map(i => <mesh key={i} geometry={roundedBox(0.1)} material={mat(i === 2 ? '#ffffff' : '#d9a86c')} position={[0, i * 0.035, 0]} scale={[0.24, 0.03, 0.24]} castShadow />)}
        <mesh geometry={roundedBox(0.2)} material={mat('#e0473b')} position={[0, 0.088, 0]} scale={[0.1, 0.004, 0.06]} />
      </group>
      <group ref={carryReport} visible={false} position={[0, 0.3, 0.18]} rotation={[-0.4, 0, 0]}>
        <mesh geometry={roundedBox(0.1)} material={mat('#ffffff')} scale={[0.12, 0.16, 0.01]} />
        {[0, 1, 2].map(i => <mesh key={i} geometry={roundedBox(0.1)} material={mat('#3b3f63')} position={[0, 0.04 - i * 0.03, 0.006]} scale={[0.08, 0.008, 0.002]} />)}
      </group>
      <group ref={gem} visible={false}>
        <mesh material={gemMaterial} scale={[0.06, 0.09, 0.06]}><octahedronGeometry args={[1, 0]} /></mesh>
      </group>
      <group ref={zzz} visible={false}>
        {[0, 1, 2].map(i => <mesh key={i} geometry={roundedBox(0.2)} material={mat('#c9c3ff', { emissive: '#8f84ff', glow: 0.8 })} />)}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={mat('#000000', { opacity: 0.22 })}>
        <circleGeometry args={[0.22, 20]} />
      </mesh>
      <mesh position={[0, 0.38, 0]} material={mat('#000000', { opacity: 0 })}>
        <boxGeometry args={[0.5, 0.8, 0.5]} />
      </mesh>
    </group>
  );
}
