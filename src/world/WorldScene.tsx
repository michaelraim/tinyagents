import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Color, InstancedMesh, MathUtils, Object3D, Vector3, type DirectionalLight } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Building } from '../../shared/building';
import type { Agent } from '../../shared/protocol';
import { BuildingView } from './Building';
import { Person, lookFor } from './Person';
import { Overhead } from './Overhead';
import type { World } from './sim';
import { City } from './Neon';
import { preloadAssets } from './assets';
import { Upgrades } from './Upgrades';
import { scrollCode } from './codeScreen';
import type { UpgradeId } from './game';

// Start fetching characters and core furniture before the scene asks for them.
preloadAssets();
import { CafeHappenings, Drama, Floaters, Pet, Rain, RoomBeacons } from './Happenings';
import { fx } from './fx';
const catActive = () => fx.cat;
import type { Look } from './Person';

export type CameraCommand = { kind: 'focus'; x: number; z: number; zoom?: number; id: number } | { kind: 'home'; id: number } | { kind: 'zoom'; by: number; id: number };

const NIGHT_SKY = new Color('#0f0c24'), DAY_SKY = new Color('#9cc7ef'), DUSK_SKY = new Color('#e98a7a');

/** Sun, sky and ambient light for a time of day. `daylight` is 0 (night) to 1 (noon). */
function Lights({ plan, daylight }: { plan: Building; daylight: number }) {
  const sun = useRef<DirectionalLight>(null);
  const { x, z, w, d } = plan.bounds;
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    // Fit the shadow camera to the building so big offices keep their shadows.
    const half = Math.max(w, d) * 0.65 + 4;
    const cam = light.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.near = 1; cam.far = 200;
    cam.updateProjectionMatrix();
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();
  }, [x, z, w, d]);
  const dusk = 1 - Math.abs(daylight - 0.45) / 0.45;
  const sky = useMemo(() => NIGHT_SKY.clone().lerp(DAY_SKY, daylight).lerp(DUSK_SKY, Math.max(0, dusk) * 0.35), [daylight, dusk]);
  return <>
    <color attach="background" args={[sky]} />
    <fog attach="fog" args={[sky, 70, 210]} />
    <hemisphereLight args={[new Color('#5f5fb0').lerp(new Color('#fff6ea'), daylight), new Color('#1a1630').lerp(new Color('#9a90c0'), daylight), 0.35 + daylight * 0.95]} />
    <ambientLight intensity={0.1 + daylight * 0.25} color={new Color('#7f7cff').lerp(new Color('#ffffff'), daylight)} />
    <directionalLight ref={sun} castShadow position={[x + 30, 48, z + 26]} intensity={0.3 + daylight * 2.1} color={new Color('#9fb0ff').lerp(new Color('#ffe9cc'), daylight)}
      shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.03} />
  </>;
}
function CameraRig({ plan, command, followKey, world }: { plan: Building; command?: CameraCommand; followKey?: string; world: World }) {
  const controls = useThree(s => s.controls) as unknown as OrbitControlsImpl | null;
  const { camera } = useThree();
  const goal = useRef<{ target: Vector3; distance: number } | null>(null);
  const homed = useRef(false);

  const size = useThree(s => s.size);
  const home = () => {
    const { x, z, w, d } = plan.bounds;
    // Fit the whole building on screen, whatever the screen's shape.
    const aspect = size.width / Math.max(1, size.height);
    const halfV = MathUtils.degToRad(15), halfH = Math.atan(Math.tan(halfV) * aspect);
    const fitWidth = (w * 0.5) / Math.tan(halfH), fitDepth = (d * 0.62) / Math.tan(halfV);
    // Frame most of the building; a little cropping makes it feel full and close.
    goal.current = { target: new Vector3(x, 0, z + 1), distance: Math.max(fitWidth, fitDepth, 20) * 0.82 };
  };

  useEffect(() => {
    if (!homed.current && controls) {
      home();
      // Start from the final angle on first load.
      const { target, distance } = goal.current!;
      const dir = new Vector3(0.55, 0.95, 1).normalize();
      camera.position.copy(target).addScaledVector(dir, distance * 1.25);
      controls.target.copy(target);
      homed.current = true;
    }
  }, [controls]);

  useEffect(() => {
    if (!command) return;
    if (command.kind === 'home') home();
    if (command.kind === 'focus') goal.current = { target: new Vector3(command.x, 0, command.z), distance: command.zoom ?? 11 };
    if (command.kind === 'zoom' && controls) {
      // Consecutive clicks compound from the pending goal, not the half-way camera.
      const distance = goal.current?.distance ?? camera.position.distanceTo(controls.target);
      goal.current = { target: goal.current?.target ?? controls.target.clone(), distance: MathUtils.clamp(distance * command.by, 5, 160) };
    }
  }, [command?.id]);

  useFrame((_, dt) => {
    if (!controls) return;
    if (followKey) {
      const body = world.bodies.get(followKey);
      if (body) {
        const t = new Vector3(body.x, 0.6, body.z);
        controls.target.lerp(t, 1 - Math.exp(-dt * 4));
      }
    }
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-dt * 3.5);
      const before = controls.target.clone();
      if (!followKey) controls.target.lerp(g.target, k);
      const offset = camera.position.clone().sub(before);
      const length = MathUtils.lerp(offset.length(), g.distance, k);
      camera.position.copy(controls.target).add(offset.setLength(length));
      if (controls.target.distanceTo(g.target) < 0.05 && Math.abs(length - g.distance) < 0.05) goal.current = null;
    }
    // Publish a zoom bucket so overhead labels can level-of-detail themselves.
    const distance = camera.position.distanceTo(controls.target);
    const bucket = distance < 16 ? 'near' : distance < 38 ? 'mid' : 'far';
    if (document.documentElement.dataset.taZoom !== bucket) document.documentElement.dataset.taZoom = bucket;
  });
  return null;
}

/** Visitors (couriers, the cat) come and go; poll the world for them. */
function useNpcKeys(world: World) {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const next = [...world.bodies.values()].filter(b => b.npc).map(b => b.key).sort();
      setKeys(prev => prev.join() === next.join() ? prev : next);
    }, 400);
    return () => clearInterval(id);
  }, [world]);
  return keys;
}
const npcLook: Look = { variant: 'male-e', lead: false, junior: false, provider: 'codex', headset: false };
const npcAgent = (key: string) => ({ key, name: 'Visitor', provider: 'codex', agentId: key, sessionId: key, project: { id: 'npc', name: 'npc', theme: 'studio' }, state: 'coding', activity: '', at: 0, joinedAt: 0, tools: {}, toolMarks: {}, version: 1, id: key, phase: 'state' }) as unknown as Agent;

/**
 * Furniture never moves, so shadows only need refreshing for walkers: every third frame
 * is plenty and saves most of the shadow pass.
 */
function ShadowThrottle() {
  const gl = useThree(s => s.gl);
  const frame = useRef(0);
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; return () => { gl.shadowMap.autoUpdate = true; }; }, [gl]);
  useFrame(() => { if (frame.current++ % 3 === 0) gl.shadowMap.needsUpdate = true; });
  return null;
}

/** If the machine can't keep up, ask once to switch to the fast renderer. */
function FpsWatch({ onSlow }: { onSlow: () => void }) {
  const samples = useRef<number[]>([]), fired = useRef(false), started = useRef(performance.now());
  useFrame((_, dt) => {
    if (fired.current || performance.now() - started.current < 6000) return;
    samples.current.push(dt);
    if (samples.current.length < 240) return;
    const fps = samples.current.length / samples.current.reduce((a, b) => a + b, 0);
    samples.current = [];
    if (fps < 30) { fired.current = true; onSlow(); }
  });
  return null;
}

function Simulation({ world, paused, speed }: { world: World; paused: boolean; speed: number }) {
  const gl = useThree(s => s.gl);
  // Dev-only: expose renderer stats for performance checks.
  if (import.meta.env.DEV) (window as unknown as { __gl: unknown }).__gl = gl;
  useFrame((_, dt) => { if (!paused) { world.update(Math.min(dt, 0.1) * speed, performance.now()); scrollCode(dt * speed); } });
  return null;
}

/** Confetti bursts when someone finishes their work. */
function Confetti({ world }: { world: World }) {
  const mesh = useRef<InstancedMesh>(null);
  const COUNT = 600;
  const particles = useMemo(() => Array.from({ length: COUNT }, () => ({ alive: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, vr: 0 })), []);
  const seen = useRef(new Map<string, string>());
  const dummy = useMemo(() => new Object3D(), []);
  const colors = ['#ff5d8f', '#ffd23f', '#3bceac', '#4f8cff', '#b06bff', '#ff8a3d'];
  useEffect(() => {
    if (!mesh.current) return;
    const color = new Color();
    for (let i = 0; i < COUNT; i++) mesh.current.setColorAt(i, color.set(colors[i % colors.length]));
    mesh.current.instanceColor!.needsUpdate = true;
  }, []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let cursor = 0;
    for (const body of world.bodies.values()) {
      const mark = body.mood === 'celebrate' ? 'celebrate' : body.reaction?.kind === 'cheer' ? `cheer${body.reaction.at}` : '';
      if (mark && seen.current.get(body.key) !== mark) {
        for (let n = 0; n < 60; n++) {
          while (cursor < COUNT && particles[cursor].alive > 0) cursor++;
          if (cursor >= COUNT) break;
          const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2.5;
          Object.assign(particles[cursor], { alive: 2.2 + Math.random(), x: body.x, y: 1.4, z: body.z, vx: Math.cos(a) * s * 0.6, vy: 3.5 + Math.random() * 3, vz: Math.sin(a) * s * 0.6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 18 });
        }
      }
      seen.current.set(body.key, mark);
    }
    if (!mesh.current) return;
    for (let i = 0; i < COUNT; i++) {
      const p = particles[i];
      if (p.alive > 0) {
        p.alive -= dt; p.vy -= 9 * dt; p.vx *= 0.985; p.vz *= 0.985;
        p.x += p.vx * dt; p.y = Math.max(0.03, p.y + p.vy * dt); p.z += p.vz * dt; p.r += p.vr * dt;
        if (p.y <= 0.03) { p.vx *= 0.8; p.vz *= 0.8; p.vr *= 0.8; }
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.r, p.r * 0.7, 0);
      dummy.scale.setScalar(p.alive > 0 ? Math.min(1, p.alive) * 0.09 : 0);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
    <planeGeometry args={[1, 0.6]} />
    <meshStandardMaterial side={2} roughness={0.6} />
  </instancedMesh>;
}

export function WorldScene({ plan, world, agents, roles, stateSince, now, daylight, paused, speed = 1, unlocked = [], tv = false, quality = 'high', onSlow, selectedKey, followKey, command, onSelect, onPoke, onSelectRoom, showcase = false }: {
  plan: Building; world: World; agents: Agent[]; roles: Map<string, 'lead' | 'sub' | 'solo'>; stateSince: Map<string, number>; now: number; daylight: number; paused: boolean; speed?: number; unlocked?: UpgradeId[]; tv?: boolean; quality?: 'high' | 'low'; onSlow?: () => void;
  selectedKey?: string; followKey?: string; command?: CameraCommand;
  onSelect: (key?: string) => void; onPoke: (key: string) => void; onSelectRoom: (id: string) => void;
  /** Landing-page mode: slow orbit, no zoom or pan. */
  showcase?: boolean;
}) {
  const night = daylight < 0.45;
  const npcs = useNpcKeys(world);
  const agentsByRoom = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const room of plan.rooms) map.set(room.id, room.pods.flatMap(p => p.seats.map(s => agents.find(a => a.key === s.agent.key) ?? s.agent)));
    return map;
  }, [plan, agents]);
  const activeKeys = useMemo(() => new Set(agents.filter(a => ['coding', 'thinking', 'reading', 'testing', 'waiting', 'blocked'].includes(a.state) && now - a.at < 5 * 60_000).map(a => a.key)), [agents, now]);
  const seated = useMemo(() => new Set(plan.seats.map(s => s.agent.key)), [plan]);
  const looks = useMemo(() => new Map(agents.map(a => [a.key, lookFor(a, roles.get(a.key) === 'lead')])), [agents.map(a => a.key + (roles.get(a.key) ?? '')).join('|')]);

  const high = quality === 'high';
  return <Canvas shadows={high} dpr={high ? [1, 1.5] : [1, 1]} camera={{ fov: 30, near: 0.5, far: 600, position: [40, 60, 60] }}
    gl={{ antialias: false, powerPreference: 'high-performance' }}
    onPointerMissed={() => onSelect(undefined)}>
    <Lights plan={plan} daylight={daylight} />
    <City plan={plan} daylight={daylight} />
    <Suspense fallback={null}><BuildingView plan={plan} agentsByRoom={agentsByRoom} activeKeys={activeKeys} now={now} night={night} onSelectRoom={onSelectRoom} /></Suspense>
    <Suspense fallback={null}>{agents.filter(a => seated.has(a.key)).map(agent => <group key={agent.key}>
      <Person agent={agent} look={looks.get(agent.key)!} world={world} onSelect={key => onSelect(key)} onPoke={onPoke} />
      <Overhead agent={agent} world={world} role={roles.get(agent.key) ?? 'solo'} selected={agent.key === selectedKey}
        stateSince={stateSince.get(agent.key) ?? agent.joinedAt} now={now} onSelect={key => onSelect(key)} />
    </group>)}</Suspense>
    <Confetti world={world} />
    <Suspense fallback={null}>{npcs.filter(k => k !== 'npc:cat').map(key => <Person key={key} agent={npcAgent(key)} look={npcLook} world={world} onSelect={() => {}} onPoke={() => {}} />)}</Suspense>
    <Pet world={world} id="npc:cat" kind="cat" active={catActive} />
    <Floaters />
    <RoomBeacons plan={plan} agentsByRoom={agentsByRoom} />
    <Rain plan={plan} />
    <CafeHappenings plan={plan} />
    <Drama />
    <Suspense fallback={null}><Upgrades plan={plan} world={world} unlocked={unlocked} night={night} /></Suspense>
    <Simulation world={world} paused={paused} speed={speed} />
    {high && <ShadowThrottle />}
    {high && onSlow && <FpsWatch onSlow={onSlow} />}
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={170} autoRotate={showcase || tv} autoRotateSpeed={tv ? 0.6 : 0.35} enableZoom={!showcase} enablePan={!showcase}
      minPolarAngle={0.35} maxPolarAngle={1.12} screenSpacePanning={false}
      mouseButtons={showcase ? { LEFT: 0, MIDDLE: 1, RIGHT: 0 } : { LEFT: 2, MIDDLE: 1, RIGHT: 0 }}
      touches={showcase ? { ONE: 0, TWO: 3 } : { ONE: 1, TWO: 3 }} />
    <CameraRig plan={plan} command={command} followKey={followKey} world={world} />
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {high ? <N8AO halfRes aoRadius={1.6} intensity={2.6} distanceFalloff={0.6} quality="performance" color="#1a1530" /> : <></>}
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.5 + (1 - daylight) * 0.9} radius={0.7} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.3} darkness={0.45} />
    </EffectComposer>
  </Canvas>;
}
