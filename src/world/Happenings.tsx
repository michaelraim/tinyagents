import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { InstancedMesh, Object3D, PointLight, Vector3, type Group } from 'three';
import type { Building, Room } from '../../shared/building';
import type { Agent } from '../../shared/protocol';
import { fx, subscribeFx, floatText } from './fx';
import { mat, roundedBox, sphere } from './kit';
import { play } from './sfx';
import type { World } from './sim';

/** "+3 ⭐" style pops that rise above someone and fade. */
export function Floaters() {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeFx(() => setVersion(v => v + 1)), []);
  useEffect(() => { const id = setInterval(() => setVersion(v => v + 1), 1000); return () => clearInterval(id); }, []);
  const live = fx.floaters.filter(f => performance.now() - f.at < 1900);
  return <>{live.map(f => <Html key={f.id} position={[f.x, 2.1, f.z]} center zIndexRange={[50, 40]} style={{ pointerEvents: 'none' }}>
    <div className="ta-floater" style={{ color: f.color }}>{f.text}</div>
  </Html>)}</>;
}

/** A spinning warning light over each room with someone stuck (red) or waiting for you (amber). */
export function RoomBeacons({ plan, agentsByRoom }: { plan: Building; agentsByRoom: Map<string, Agent[]> }) {
  return <>{plan.rooms.filter(r => r.kind === 'project').map(room => {
    const agents = agentsByRoom.get(room.id) ?? [];
    const stuck = agents.some(a => a.state === 'blocked'), waiting = agents.some(a => a.state === 'waiting');
    if (!stuck && !waiting) return null;
    return <Beacon key={room.id} room={room} color={stuck ? '#ff3b5c' : '#ffb020'} />;
  })}</>;
}

function Beacon({ room, color }: { room: Room; color: string }) {
  const head = useRef<Group>(null), light = useRef<PointLight>(null);
  const x = room.door.x + 0.9, z = room.z - room.side * (room.d / 2) + room.side * 0.12;
  useFrame(({ clock }) => {
    if (head.current) head.current.rotation.y = clock.elapsedTime * 6;
    if (light.current) light.current.intensity = 4 + Math.sin(clock.elapsedTime * 12) * 3;
  });
  return <group position={[x, 1.7, z]}>
    <mesh geometry={roundedBox(0.3)} material={mat('#24263a')} scale={[0.22, 0.1, 0.22]} />
    <group ref={head}>
      <mesh position={[0, 0.12, 0]} scale={[0.14, 0.16, 0.14]} geometry={sphere(12)}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0.18, 0.12, 0]} scale={[0.3, 0.05, 0.05]} geometry={roundedBox(0.3)}>
        <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
    <pointLight ref={light} color={color} distance={7} decay={1.6} position={[0, 0.2, 0]} />
  </group>;
}

/** Rain over the whole block while it's raining. */
export function Rain({ plan }: { plan: Building }) {
  const mesh = useRef<InstancedMesh>(null);
  const COUNT = 900;
  const drops = useMemo(() => Array.from({ length: COUNT }, () => ({ x: (Math.random() - 0.5) * 90, y: Math.random() * 20, z: (Math.random() - 0.5) * 70, v: 14 + Math.random() * 6 })), []);
  const o = useMemo(() => new Object3D(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = fx.raining;
    if (!fx.raining) return;
    for (let i = 0; i < COUNT; i++) {
      const d = drops[i];
      d.y -= d.v * Math.min(dt, 0.05);
      if (d.y < 0) d.y = 18 + Math.random() * 4;
      o.position.set(plan.bounds.x + d.x, d.y, plan.bounds.z + d.z);
      o.scale.set(0.02, 0.45, 0.02);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false} visible={false}>
    <boxGeometry />
    <meshBasicMaterial color="#9fd8ff" transparent opacity={0.45} />
  </instancedMesh>;
}

/** Café happenings: pizza on the tables, a birthday cake, a broken coffee machine. */
export function CafeHappenings({ plan }: { plan: Building }) {
  // Html ignores hidden parents, so the sign is mounted only while the machine is broken.
  const [isBroken, setBroken] = useState(fx.coffeeBroken);
  useEffect(() => subscribeFx(() => setBroken(fx.coffeeBroken)), []);
  const cafe = plan.rooms.find(r => r.kind === 'cafe');
  const pizza = useRef<Group>(null), cake = useRef<Group>(null), broken = useRef<Group>(null), sparks = useRef<Group>(null);
  useFrame(({ clock }) => {
    const now = performance.now();
    if (pizza.current) pizza.current.visible = now < fx.pizzaUntil;
    if (cake.current) { cake.current.visible = now < fx.cakeUntil; cake.current.rotation.y = clock.elapsedTime * 0.5; }
    if (broken.current) broken.current.visible = fx.coffeeBroken;
    sparks.current?.children.forEach((c, i) => {
      const p = (clock.elapsedTime * 2.5 + i / 5) % 1;
      c.position.set(Math.sin(i * 7 + p * 3) * 0.3 * p, 0.3 + p * 0.5 - p * p * 0.6, Math.cos(i * 5) * 0.3 * p);
      c.scale.setScalar(0.05 * (1 - p));
    });
  });
  if (!cafe) return null;
  const s = cafe.side, back = cafe.z + s * cafe.d / 2, inward = -s, left = cafe.x - cafe.w / 2;
  const tables = Math.max(2, Math.floor((cafe.w - 3) / 4));
  const machineX = cafe.x - (cafe.w - 2.4) / 2 + 0.87 / 2;
  return <group>
    <group ref={pizza} visible={false}>
      {Array.from({ length: tables }, (_, i) => {
        const tx = left + 2.2 + i * ((cafe.w - 4.4) / Math.max(1, tables - 1));
        return <group key={i} position={[tx, 0.66, cafe.z + inward * 1.2]} rotation={[0, i, 0]}>
          <mesh geometry={roundedBox(0.1)} material={mat('#d9a86c')} scale={[0.55, 0.04, 0.55]} />
          <mesh geometry={sphere(16)} material={mat('#f2b950')} position={[0, 0.03, 0]} scale={[0.46, 0.03, 0.46]} />
          {[0, 1, 2, 3, 4].map(k => <mesh key={k} geometry={sphere(8)} material={mat('#d8402f')} position={[Math.sin(k * 1.3) * 0.13, 0.05, Math.cos(k * 1.3) * 0.13]} scale={[0.07, 0.02, 0.07]} />)}
        </group>;
      })}
    </group>
    <group ref={cake} visible={false} position={[left + 2.2, 0.66, cafe.z + inward * 1.2]}>
      <mesh geometry={sphere(20)} material={mat('#ff9ad8')} position={[0, 0.12, 0]} scale={[0.5, 0.28, 0.5]} />
      <mesh geometry={sphere(20)} material={mat('#ffffff')} position={[0, 0.26, 0]} scale={[0.36, 0.14, 0.36]} />
      {[0, 1, 2].map(k => <group key={k} position={[Math.sin(k * 2.1) * 0.1, 0.36, Math.cos(k * 2.1) * 0.1]}>
        <mesh geometry={roundedBox(0.3)} material={mat('#3ee8ff')} scale={[0.02, 0.1, 0.02]} />
        <mesh geometry={sphere(8)} position={[0, 0.07, 0]} scale={0.03}><meshBasicMaterial color="#ffd23f" toneMapped={false} /></mesh>
      </group>)}
    </group>
    <group ref={broken} visible={false} position={[machineX, 1.0, back + inward * 0.45]}>
      <group ref={sparks}>{Array.from({ length: 8 }, (_, i) => <mesh key={i} geometry={sphere(6)}><meshBasicMaterial color="#ffd23f" toneMapped={false} /></mesh>)}</group>
      {isBroken && <Html position={[0, 0.9, 0]} center style={{ pointerEvents: 'none' }}><div className="ta-sign-broken">OUT OF ORDER 😱</div></Html>}
    </group>
  </group>;
}

/** An office pet (the visiting cat, or the dog you can buy). It wanders and loves attention. */
export function Pet({ world, id, kind, active }: { world: World; id: string; kind: 'cat' | 'dog'; active: () => boolean }) {
  const root = useRef<Group>(null), tail = useRef<Group>(null), head = useRef<Group>(null);
  const dog = kind === 'dog';
  useFrame(({ clock }) => {
    const b = world.bodies.get(id), g = root.current;
    if (!g) return;
    if (!b || !active()) { g.visible = false; return; }
    g.visible = b.phase !== 'gone';
    g.position.set(b.x, 0, b.z);
    g.rotation.y = b.angle;
    const t = clock.elapsedTime;
    const walking = b.phase === 'walking';
    g.position.y = walking ? Math.abs(Math.sin(t * 12)) * 0.04 : 0;
    if (tail.current) tail.current.rotation.z = Math.sin(t * (dog ? 14 : walking ? 6 : 2)) * (dog ? 0.7 : 0.5);
    if (head.current) head.current.rotation.y = walking ? 0 : Math.sin(t * 0.7) * 0.5;
  });
  const fur = mat(dog ? '#b8794a' : '#f08a3c'), light = mat(dog ? '#f5e6d3' : '#ffd9b0'), dark = mat('#1b1b22');
  const s = dog ? 1.25 : 1;
  return <group ref={root} visible={false} onClick={e => {
    e.stopPropagation(); play(dog ? 'pop' : 'purr');
    const b = world.bodies.get(id);
    if (b) floatText(dog ? '🐶 woof!' : '💗 purr', b.x, b.z, '#ff8ad8');
  }}>
    <group scale={s}>
      <mesh geometry={roundedBox(0.4)} material={fur} position={[0, 0.2, 0]} scale={[0.22, 0.2, 0.42]} castShadow />
      {[[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.14], [0.07, -0.14]].map(([x, z], i) => <mesh key={i} geometry={roundedBox(0.4)} material={light} position={[x, 0.06, z]} scale={[0.06, 0.12, 0.06]} />)}
      <group ref={head} position={[0, 0.34, 0.22]}>
        <mesh geometry={roundedBox(0.45)} material={fur} scale={[0.22, 0.18, 0.18]} castShadow />
        {dog
          ? [-1, 1].map(e => <mesh key={e} geometry={roundedBox(0.3)} material={mat('#7a4a2a')} position={[e * 0.12, 0.02, -0.01]} rotation={[0, 0, e * 0.25]} scale={[0.05, 0.14, 0.09]} />)
          : [-1, 1].map(e => <mesh key={e} geometry={roundedBox(0.2)} material={fur} position={[e * 0.07, 0.11, 0]} rotation={[0, 0, e * -0.3]} scale={[0.06, 0.08, 0.04]} />)}
        {dog && <mesh geometry={roundedBox(0.4)} material={light} position={[0, -0.03, 0.1]} scale={[0.12, 0.09, 0.1]} />}
        {[-1, 1].map(e => <mesh key={e} geometry={sphere(6)} material={dark} position={[e * 0.05, 0.02, 0.09]} scale={0.025} />)}
        <mesh geometry={sphere(6)} material={dog ? dark : mat('#ff8ad8')} position={[0, dog ? -0.01 : -0.02, dog ? 0.155 : 0.095]} scale={dog ? 0.025 : 0.015} />
      </group>
      <group ref={tail} position={[0, 0.26, -0.2]}>
        <mesh geometry={roundedBox(0.5)} material={fur} position={[0, 0.12, -0.03]} rotation={[0.4, 0, 0]} scale={[0.05, dog ? 0.18 : 0.26, 0.05]} />
      </group>
      {dog && <mesh geometry={roundedBox(0.3)} material={mat('#ff4f6d', { emissive: '#ff4f6d', glow: 0.3 })} position={[0, 0.27, 0.16]} scale={[0.2, 0.035, 0.12]} />}
    </group>
  </group>;
}

const shakeOffset = new Vector3();
/** Brief camera shake and light flicker for dramatic moments. */
export function Drama() {
  const { camera, scene } = useThree();
  const applied = useRef(new Vector3());
  useFrame(() => {
    const now = performance.now();
    camera.position.sub(applied.current);
    if (now < fx.shakeUntil) {
      const k = (fx.shakeUntil - now) / 350;
      shakeOffset.set((Math.random() - 0.5) * 0.25 * k, (Math.random() - 0.5) * 0.18 * k, (Math.random() - 0.5) * 0.25 * k);
    } else shakeOffset.set(0, 0, 0);
    camera.position.add(shakeOffset);
    applied.current.copy(shakeOffset);
    const flickering = now < fx.flickerUntil;
    if (flickering || (scene.userData.flickered && !flickering)) {
      scene.traverse(o => { if ((o as PointLight).isPointLight) o.visible = !flickering || Math.random() > 0.5; });
      scene.userData.flickered = flickering;
    }
  });
  return null;
}

