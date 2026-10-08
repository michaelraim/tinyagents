import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshStandardMaterial } from 'three';
import { Ball, Block, Cyl, RBox, mat, seeded } from './kit';
import { world as c } from './palette';
import { Kit, KENNEY_SCALE } from './assets';
import { codeTexture } from './codeScreen';

type V3 = [number, number, number];

/** Top of a Kenney desk at world scale. */
export const DESK_TOP = 0.384 * KENNEY_SCALE;

export function DeskPod({ x, z, columns, chairColors, active }: { x: number; z: number; columns: number; chairColors: string[]; active: boolean[] }) {
  const pitch = 1.35;
  const rand = seeded(`${x}:${z}`);
  const clutter = (k: number) => {
    const roll = rand();
    if (roll < 0.25) return <Kit key={k} name="plantSmall1" position={[0.42, DESK_TOP, 0.1]} scale={0.8} />;
    if (roll < 0.45) return <Kit key={k} name="books" position={[-0.45, DESK_TOP, 0.05]} rotation={rand() * 0.6} scale={0.7} />;
    if (roll < 0.6) return <Kit key={k} name="lampSquareTable" position={[0.45, DESK_TOP, -0.1]} scale={0.8} />;
    if (roll < 0.75) return <Cyl key={k} size={[0.08, 0.1, 0.08]} position={[0.42, DESK_TOP + 0.05, 0.22]} color={['#e8735a', '#ffffff', '#3ee8ff', '#ffd23f'][Math.floor(rand() * 4)]} />;
    return null;
  };
  return <group position={[x, 0, z]}>
    {Array.from({ length: columns * 2 }, (_, k) => {
      const column = Math.floor(k / 2), across = k % 2 === 0 ? 1 : -1;
      const sx = (column - (columns - 1) / 2) * pitch;
      const on = active[k] ?? false;
      // Everything for one seat is built facing +z, then turned towards its chair.
      return <group key={k} position={[sx, 0, across * 0.49]} rotation={[0, across > 0 ? 0 : Math.PI, 0]}>
        <Kit name="desk" />
        <Kit name="computerScreen" position={[0, DESK_TOP, -0.25]} />
        {on && <mesh position={[0, DESK_TOP + 0.3, -0.21]}>
          <planeGeometry args={[0.6, 0.34]} />
          <meshBasicMaterial map={codeTexture()} color="#d8ecff" toneMapped={false} />
        </mesh>}
        <Kit name="computerKeyboard" position={[0, DESK_TOP, 0.15]} />
        {clutter(k)}
        <Kit name="chairDesk" position={[0, 0, 0.96]} rotation={Math.PI} tint={chairColors[k % chairColors.length]} />
      </group>;
    })}
  </group>;
}
export function PingPong({ position }: { position: V3 }) {
  // The ball moves, so it must stay out of any batch.
  const ball = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ball.current) return;
    const t = clock.elapsedTime * 1.25;
    const p = (t % 2) < 1 ? t % 1 : 1 - (t % 1);
    ball.current.position.set(-1.2 + p * 2.4, 0.86 + Math.abs(Math.sin(p * Math.PI * 2)) * 0.35, Math.sin(t * 2.2) * 0.3);
  });
  return <group position={position}>
    <RBox size={[2.6, 0.06, 1.45]} round={0.15} position={[0, 0.76, 0]} color="#2f7d5a" />
    <Block size={[2.62, 0.005, 0.03]} position={[0, 0.795, 0]} color="#ffffff" shadow={false} />
    <Block size={[0.03, 0.005, 1.47]} position={[0, 0.795, 0]} color="#ffffff" shadow={false} />
    <Block size={[0.03, 0.16, 1.5]} position={[0, 0.87, 0]} color="#f2f2f2" />
    {[-1, 1].flatMap(sx => [-1, 1].map(sz => <Block key={`${sx}${sz}`} size={[0.06, 0.74, 0.06]} position={[sx * 1.15, 0.37, sz * 0.6]} color={c.metal} />))}
    <mesh ref={ball} castShadow><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#ffffff" emissive="#ffaa55" emissiveIntensity={0.2} /></mesh>
  </group>;
}

export function Arcade({ position, rotation = 0, color }: { position: V3; rotation?: number; color: string }) {
  const screen = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => { if (screen.current) screen.current.emissiveIntensity = 0.8 + Math.sin(clock.elapsedTime * 7 + position[0]) * 0.3; });
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox size={[0.9, 1.7, 0.75]} round={0.08} position={[0, 0.85, 0]} color={color} />
    <RBox size={[0.92, 0.3, 0.5]} round={0.2} position={[0, 0.98, 0.42]} rotation={[0.35, 0, 0]} color="#2a2a33" />
    <mesh position={[0, 1.38, 0.38]} rotation={[-0.15, 0, 0]}>
      <boxGeometry args={[0.66, 0.5, 0.02]} />
      <meshStandardMaterial ref={screen} color="#1b1b3a" emissive="#ff4fd8" emissiveIntensity={0.9} />
    </mesh>
    <Ball size={0.08} position={[-0.18, 1.12, 0.52]} color="#ff4f4f" />
    {[0, 1].map(i => <Ball key={i} size={0.07} position={[0.08 + i * 0.13, 1.1, 0.54]} color={['#ffd23f', '#4fd1ff'][i]} />)}
    <RBox size={[0.92, 0.16, 0.77]} round={0.2} position={[0, 1.78, 0]} color="#ffd23f" />
  </group>;
}

export function Whiteboard({ position, rotation = 0 }: { position: V3; rotation?: number }) {
  const rand = seeded(`wb:${position.join(',')}`);
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox size={[2.2, 1.1, 0.06]} round={0.1} position={[0, 1.35, 0]} color="#ffffff" />
    {Array.from({ length: 6 }, (_, i) => <Block key={i} size={[0.3 + rand() * 0.9, 0.035, 0.01]} position={[-0.6 + rand() * 0.6, 1.65 - i * 0.13, 0.035]} color={['#3b82f6', '#ef4444', '#22c55e', '#1f2937'][i % 4]} shadow={false} />)}
    <Block size={[0.4, 0.3, 0.01]} position={[0.75, 1.5, 0.035]} color="#fde68a" shadow={false} />
    <Block size={[0.3, 0.25, 0.01]} position={[0.7, 1.12, 0.035]} color="#a7f3d0" shadow={false} />
  </group>;
}

export function Tv({ position, rotation = 0, color = '#1b2440' }: { position: V3; rotation?: number; color?: string }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <RBox size={[1.9, 1.05, 0.06]} round={0.08} color="#1c1d22" />
    <Block size={[1.78, 0.93, 0.01]} position={[0, 0, 0.035]} color={color} shadow={false} material={mat(color, { emissive: color, glow: 0.35 })} />
  </group>;
}
