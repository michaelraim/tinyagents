import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, SpotLight } from 'three';
import type { Building } from '../../shared/building';
import { CORRIDOR_WIDTH } from '../../shared/building';
import { Kit } from './assets';
import { fx } from './fx';
import { mat, roundedBox, sphere } from './kit';
import { ThemeProp } from './Themes';
import { Pet } from './Happenings';
import type { UpgradeId } from './game';
import type { World } from './sim';

/**
 * Upgrades bought in the shop, placed where they never block a walkway:
 * on wall tops, in room corners and outside the building.
 */
export function Upgrades({ plan, world, unlocked, night }: { plan: Building; world: World; unlocked: UpgradeId[]; night: boolean }) {
  const has = (id: UpgradeId) => unlocked.includes(id);
  fx.rainbow = has('neon');
  const lobby = plan.rooms.find(r => r.kind === 'lobby');
  const lounge = plan.rooms.find(r => r.kind === 'lounge');
  const cafe = plan.rooms.find(r => r.kind === 'cafe');
  const dogActive = useMemo(() => () => true, []);

  // The dog roams on its own schedule.
  useEffect(() => {
    if (!has('dog')) return;
    let stopped = false;
    const roam = () => {
      if (stopped) return;
      const spot = plan.spots[Math.floor(Math.random() * plan.spots.length)];
      if (!world.bodies.get('npc:dog')) world.summon('npc:dog', spot.x, spot.z, spot.facing, undefined, 9999);
      else world.visit('npc:dog', spot.x + (Math.random() - 0.5), spot.z + (Math.random() - 0.5), Math.random() * 6, 'idle', 9999);
      setTimeout(roam, 7000 + Math.random() * 7000);
    };
    roam();
    return () => { stopped = true; const dog = world.bodies.get('npc:dog'); if (dog) { dog.dwell = 0; dog.timer = 1; } };
  }, [unlocked.join(), plan, world]);

  return <group>
    {has('plants') && <WallPlanters plan={plan} />}
    {has('espresso') && cafe && <group position={[cafe.x - (cafe.w - 2.4) / 2 + 0.43 + 0.87, 0.75, cafe.z + cafe.side * cafe.d / 2 - cafe.side * 0.45]} rotation={[0, cafe.side > 0 ? Math.PI : 0, 0]}>
      <Kit name="kitchenCoffeeMachine" scale={1.5} tint="#ffcf3a" />
      <Sparkle y={0.7} />
    </group>}
    {has('aquarium') && lobby && <group position={[lobby.x - lobby.w / 2 + 1.0, 0, lobby.z + lobby.d / 2 - 1.4]} rotation={[0, Math.PI / 2, 0]}>
      <ThemeProp kind="aquarium" color="#3ee8ff" accent="#ff4fd8" />
    </group>}
    {has('disco') && lounge && <DiscoBall x={lounge.x} z={lounge.z} night={night} />}
    {has('dog') && <Pet world={world} id="npc:dog" kind="dog" active={dogActive} />}
    {has('rooftop') && lobby && <group position={[lobby.x + lobby.w / 2 - 1.5, 0, lobby.z + lobby.d / 2 + 2.6]} scale={2.2}>
      <ThemeProp kind="dish" color="#3ee8ff" accent="#ff4fd8" />
    </group>}
  </group>;
}

/** Trailing plants along the tops of the corridor walls. */
function WallPlanters({ plan }: { plan: Building }) {
  const spots = useMemo(() => {
    const list: [number, number][] = [];
    for (let x = 2; x < plan.corridor.w - 1; x += 3.2) list.push([x, -CORRIDOR_WIDTH / 2], [x + 1.6, CORRIDOR_WIDTH / 2]);
    return list;
  }, [plan.corridor.w]);
  return <>{spots.map(([x, z], i) => <group key={i} position={[x, 1.58, z]}>
    <mesh geometry={roundedBox(0.3)} material={mat('#8a5f3e')} scale={[0.9, 0.16, 0.3]} />
    {[-0.3, 0, 0.3].map(dx => <group key={dx} position={[dx, 0.1, 0]}>
      <mesh geometry={sphere(10)} material={mat(dx ? '#4fae5a' : '#3f9046')} scale={[0.3, 0.22, 0.3]} />
      <mesh geometry={roundedBox(0.4)} material={mat('#4fae5a')} position={[0, -0.32, z > 0 ? -0.12 : 0.12]} scale={[0.06, 0.5, 0.04]} />
    </group>)}
  </group>)}</>;
}

function Sparkle({ y }: { y: number }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => group.current?.children.forEach((c, i) => {
    const p = (clock.elapsedTime * 0.6 + i / 4) % 1;
    c.position.set(Math.sin(i * 2.4) * 0.3, y + p * 0.5, Math.cos(i * 2.4) * 0.3);
    c.scale.setScalar(0.06 * Math.sin(p * Math.PI));
  }));
  return <group ref={group}>{[0, 1, 2, 3].map(i => <mesh key={i} geometry={sphere(6)}><meshBasicMaterial color="#ffe27a" toneMapped={false} /></mesh>)}</group>;
}

function DiscoBall({ x, z, night }: { x: number; z: number; night: boolean }) {
  const ball = useRef<Group>(null);
  const lights = useRef<SpotLight[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ball.current) ball.current.rotation.y = t * 0.8;
    lights.current.forEach((l, i) => {
      if (!l) return;
      l.target.position.set(x + Math.sin(t * 0.9 + i * 2.1) * 3, 0, z + Math.cos(t * 0.7 + i * 2.1) * 3);
      l.target.updateMatrixWorld();
    });
  });
  return <group>
    <mesh geometry={roundedBox(0.2)} material={mat('#9aa3b2')} position={[x, 2.75, z]} scale={[0.02, 0.5, 0.02]} />
    <group ref={ball} position={[x, 2.4, z]}>
      <mesh geometry={sphere(16)} scale={0.45}><meshStandardMaterial color="#e8eef8" metalness={1} roughness={0.15} flatShading emissive="#ffffff" emissiveIntensity={night ? 0.25 : 0.05} /></mesh>
    </group>
    {night && ['#ff4fd8', '#3ee8ff', '#b6ff3b'].map((color, i) => <spotLight key={color} ref={l => { if (l) lights.current[i] = l; }}
      position={[x, 2.3, z]} color={color} intensity={18} angle={0.35} penumbra={0.5} distance={7} />)}
  </group>;
}
