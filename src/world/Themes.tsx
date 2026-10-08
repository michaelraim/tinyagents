import { useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { Ball, Block, Cyl, RBox, mat } from './kit';
import { verticalById, suggestedVertical } from '../../shared/verticals.mjs';

/**
 * Themed props: each project room gets a few signature pieces from its topic
 * (vertical), so a fintech room, a game studio and a garden app all feel different.
 */

type P = { color: string; accent: string };
type Maker = (p: P) => ReactElement;

function Blink({ position, color, speed = 3, phase = 0 }: { position: [number, number, number]; color: string; speed?: number; phase?: number }) {
  const ref = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.emissiveIntensity = Math.sin(clock.elapsedTime * speed + phase) > 0.2 ? 2.2 : 0.2; });
  return <mesh position={position} scale={0.05}><sphereGeometry args={[0.5, 8, 6]} /><meshStandardMaterial ref={ref} color={color} emissive={color} /></mesh>;
}

function Spin({ children, speed = 0.6, axis = 'y' }: { children: React.ReactNode; speed?: number; axis?: 'y' | 'z' }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation[axis] += dt * speed; });
  return <group ref={ref}>{children}</group>;
}

const makers: Record<string, Maker> = {
  server: () => <group>
    <RBox size={[0.8, 1.7, 0.7]} round={0.06} position={[0, 0.85, 0]} color="#2b2f3a" />
    {Array.from({ length: 6 }, (_, i) => <group key={i}>
      <Block size={[0.66, 0.16, 0.02]} position={[0, 0.3 + i * 0.24, 0.36]} color="#3b4150" shadow={false} />
      <Blink position={[0.24, 0.3 + i * 0.24, 0.38]} color={i % 3 ? '#46e08a' : '#5ab8ff'} speed={2 + i} phase={i} />
      <Blink position={[0.14, 0.3 + i * 0.24, 0.38]} color="#46e08a" speed={5 + i * 0.7} phase={i * 2} />
    </group>)}
  </group>,
  arcade: ({ accent }) => <group>
    <RBox size={[0.85, 1.65, 0.7]} round={0.08} position={[0, 0.83, 0]} color={accent} />
    <mesh position={[0, 1.32, 0.34]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.62, 0.46, 0.02]} /><meshStandardMaterial color="#1b1b3a" emissive="#4fd1ff" emissiveIntensity={1.1} /></mesh>
    <RBox size={[0.88, 0.26, 0.45]} round={0.2} position={[0, 0.95, 0.38]} rotation={[0.35, 0, 0]} color="#2a2a33" />
    <Ball size={0.08} position={[-0.18, 1.08, 0.48]} color="#ff4f4f" />
    <RBox size={[0.88, 0.14, 0.72]} round={0.2} position={[0, 1.72, 0]} color="#ffd23f" />
  </group>,
  globe: () => <group>
    <Cyl size={[0.36, 0.05, 0.36]} position={[0, 0.025, 0]} color="#8a5f3e" />
    <Cyl size={[0.04, 0.7, 0.04]} position={[0, 0.38, 0]} color="#8a5f3e" />
    <group position={[0, 0.95, 0]} rotation={[0, 0, 0.4]}><Spin speed={0.4}>
      <Ball size={0.62} color="#4aa3df" />
      <Ball size={[0.3, 0.22, 0.2]} position={[0.16, 0.08, 0.2]} color="#7cc66b" />
      <Ball size={[0.22, 0.25, 0.2]} position={[-0.2, -0.1, 0.14]} color="#7cc66b" />
    </Spin></group>
  </group>,
  telescope: () => <group>
    {[0, 2.1, 4.2].map(a => <Cyl key={a} size={[0.04, 0.9, 0.04]} position={[Math.sin(a) * 0.2, 0.42, Math.cos(a) * 0.2]} rotation={[Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]} color="#3a3d46" />)}
    <group position={[0, 0.95, 0]} rotation={[0.9, 0.4, 0]}>
      <Cyl size={[0.2, 1.1, 0.2]} top={0.45} bottom={0.55} color="#f4f1ec" />
      <Cyl size={[0.22, 0.1, 0.22]} position={[0, 0.55, 0]} color="#3a3d46" />
    </group>
  </group>,
  rocket: ({ accent }) => <group>
    <Cyl size={[0.42, 0.06, 0.42]} position={[0, 0.03, 0]} color="#3a3d46" />
    <Cyl size={[0.34, 1.0, 0.34]} position={[0, 0.65, 0]} color="#f4f1ec" />
    <Cyl size={[0.34, 0.4, 0.34]} top={0} bottom={0.5} position={[0, 1.35, 0]} color={accent} />
    <Ball size={0.14} position={[0, 0.85, 0.16]} color="#8fd3ff" />
    {[0, 2.1, 4.2].map(a => <RBox key={a} size={[0.06, 0.3, 0.22]} round={0.2} position={[Math.sin(a) * 0.18, 0.3, Math.cos(a) * 0.18]} rotation={[0, a, 0]} color={accent} />)}
  </group>,
  robot: ({ accent }) => <group>
    <RBox size={[0.5, 0.5, 0.36]} round={0.2} position={[0, 0.55, 0]} color="#d8dde6" />
    <RBox size={[0.42, 0.34, 0.34]} round={0.3} position={[0, 1.0, 0]} color="#e8ecf2" />
    <Block size={[0.3, 0.1, 0.02]} position={[0, 1.02, 0.17]} color="#1b1b3a" material={mat('#1b1b3a', { emissive: '#5ab8ff', glow: 1.4 })} />
    <Cyl size={[0.02, 0.2, 0.02]} position={[0, 1.25, 0]} color="#3a3d46" />
    <Blink position={[0, 1.37, 0]} color="#ff5d5d" speed={4} />
    {[-1, 1].map(s => <RBox key={s} size={[0.12, 0.4, 0.12]} round={0.4} position={[s * 0.33, 0.55, 0]} color={accent} />)}
    {[-1, 1].map(s => <RBox key={s} size={[0.14, 0.32, 0.16]} round={0.3} position={[s * 0.12, 0.16, 0]} color="#9aa3b2" />)}
  </group>,
  microscope: () => <group>
    <RBox size={[0.9, 0.7, 0.6]} round={0.06} position={[0, 0.35, 0]} color="#f4f1ec" />
    <RBox size={[0.3, 0.05, 0.3]} round={0.2} position={[0, 0.73, 0]} color="#3a3d46" />
    <RBox size={[0.08, 0.4, 0.08]} round={0.3} position={[0, 0.95, -0.1]} color="#3a3d46" />
    <Cyl size={[0.08, 0.32, 0.08]} position={[0, 1.08, 0.02]} rotation={[0.5, 0, 0]} color="#d8dde6" />
    {[0, 1, 2].map(i => <Cyl key={i} size={[0.07, 0.22, 0.07]} position={[0.25 + i * 0.1, 0.81, 0.15]} color={['#7cd3a6', '#ff8fa3', '#8fb8ff'][i]} />)}
  </group>,
  flasks: () => <group>
    <RBox size={[1.2, 0.75, 0.6]} round={0.05} position={[0, 0.37, 0]} color="#e6e8ec" />
    {[-0.4, -0.1, 0.25].map((x, i) => <group key={x} position={[x, 0.75, 0]}>
      <Cyl size={[0.22, 0.24, 0.22]} top={0.25} bottom={0.5} position={[0, 0.12, 0]} color="#ffffff" material={mat(['#7cd3a6', '#c48bff', '#ffb35c'][i], { opacity: 0.8, emissive: ['#3fe08a', '#a35cff', '#ff9a2e'][i], glow: 0.5 })} />
      <Cyl size={[0.06, 0.18, 0.06]} position={[0, 0.32, 0]} color="#ffffff" material={mat('#dff3ff', { opacity: 0.6 })} />
    </group>)}
  </group>,
  vault: () => <group>
    <RBox size={[0.95, 1.1, 0.8]} round={0.06} position={[0, 0.55, 0]} color="#5b6170" />
    <Cyl size={[0.5, 0.06, 0.5]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.6, 0.41]} color="#c9ccd3" />
    <Spin speed={0.5} axis="z"><group position={[0, 0.6, 0.45]}>{[0, 1, 2].map(i => <Block key={i} size={[0.04, 0.34, 0.03]} rotation={[0, 0, i * 1.05]} color="#3a3d46" />)}</group></Spin>
    {[0, 1, 2].map(i => <RBox key={i} size={[0.22, 0.1, 0.12]} round={0.2} position={[0.65 + (i % 2) * 0.12, 0.05 + i * 0.1, 0.1]} color="#ffcf3a" material={mat('#ffcf3a', { metal: 0.6, rough: 0.3 })} />)}
  </group>,
  ticker: ({ accent }) => <group>
    <RBox size={[1.6, 1.0, 0.08]} round={0.05} position={[0, 1.4, 0]} color="#1c1d22" />
    <Block size={[1.5, 0.9, 0.01]} position={[0, 1.4, 0.045]} color="#0f1a2a" material={mat('#0f1a2a', { emissive: '#0f1a2a', glow: 0.3 })} shadow={false} />
    {[0.2, 0.35, 0.28, 0.5, 0.42, 0.62, 0.7].map((h, i) => <Block key={i} size={[0.12, h, 0.01]} position={[-0.6 + i * 0.2, 1.0 + h / 2, 0.055]} color={i % 3 === 2 ? '#ff5d5d' : '#46e08a'} material={mat(i % 3 === 2 ? '#ff5d5d' : '#46e08a', { emissive: i % 3 === 2 ? '#ff5d5d' : '#46e08a', glow: 0.9 })} shadow={false} />)}
    <Block size={[0.02, 1.3, 0.02]} position={[0, 0.65, -0.02]} color={accent} />
  </group>,
  guitar: ({ accent }) => <group>
    <group position={[-0.25, 0, 0]}>
      <Ball size={[0.42, 0.5, 0.12]} position={[0, 0.45, 0]} color={accent} />
      <Ball size={[0.34, 0.38, 0.12]} position={[0, 0.78, 0]} color={accent} />
      <Block size={[0.07, 0.6, 0.04]} position={[0, 1.2, 0]} color="#5a3825" />
      <Cyl size={[0.25, 0.04, 0.25]} position={[0, 0.03, 0]} color="#3a3d46" />
    </group>
    <RBox size={[0.5, 0.9, 0.45]} round={0.08} position={[0.35, 0.45, 0]} color="#22252e" />
    {[0.65, 0.3].map(y => <Cyl key={y} size={[y > 0.5 ? 0.24 : 0.3, 0.02, y > 0.5 ? 0.24 : 0.3]} rotation={[Math.PI / 2, 0, 0]} position={[0.35, y, 0.23]} color="#3a3d46" />)}
  </group>,
  camera: () => <group>
    {[0, 2.1, 4.2].map(a => <Cyl key={a} size={[0.035, 1.1, 0.035]} position={[Math.sin(a) * 0.22, 0.52, Math.cos(a) * 0.22]} rotation={[Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]} color="#3a3d46" />)}
    <RBox size={[0.5, 0.36, 0.4]} round={0.15} position={[0, 1.15, 0]} color="#2b2f3a" />
    <Cyl size={[0.2, 0.3, 0.2]} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.15, 0.32]} color="#1c1d22" />
    <Blink position={[0.18, 1.3, 0.2]} color="#ff3b3b" speed={2} />
  </group>,
  easel: ({ accent }) => <group>
    {[-0.3, 0.3].map(x => <Block key={x} size={[0.05, 1.6, 0.05]} position={[x, 0.8, 0]} rotation={[0.12, 0, -x * 0.2]} color="#a87c52" />)}
    <Block size={[0.05, 1.5, 0.05]} position={[0, 0.75, -0.25]} rotation={[-0.3, 0, 0]} color="#a87c52" />
    <RBox size={[0.8, 0.9, 0.04]} round={0.05} position={[0, 1.15, 0.08]} rotation={[0.12, 0, 0]} color="#ffffff" />
    <Ball size={[0.3, 0.3, 0.02]} position={[-0.12, 1.25, 0.12]} color={accent} />
    <Ball size={[0.22, 0.18, 0.02]} position={[0.16, 1.0, 0.11]} color="#ffd23f" />
  </group>,
  planters: () => <group>
    {[-0.45, 0.45].map(x => <group key={x} position={[x, 0, 0]}>
      <RBox size={[0.8, 0.45, 0.6]} round={0.1} position={[0, 0.22, 0]} color="#a87c52" />
      {[0, 1, 2].map(i => <Ball key={i} size={[0.3, 0.38, 0.3]} position={[-0.22 + i * 0.22, 0.6, 0]} color={['#5bb35a', '#7cc66b', '#3f9046'][i]} />)}
      {x > 0 && <Ball size={0.12} position={[0.1, 0.82, 0.1]} color="#ff6b8a" />}
    </group>)}
  </group>,
  parcels: () => <group>
    <RBox size={[1.3, 0.05, 0.6]} round={0.1} position={[0, 0.05, 0]} color="#a87c52" />
    {[[-0.35, 0.3, 0], [0.3, 0.3, 0.02], [-0.05, 0.75, 0], [0.4, 0.7, -0.05]].map((p, i) => <RBox key={i} size={[0.5, 0.45, 0.5]} round={0.06} position={p as [number, number, number]} rotation={[0, i * 0.2, 0]} color={['#d9a86c', '#c9955a', '#e2b57c', '#d0a064'][i]} />)}
  </group>,
  kitchen: ({ accent }) => <group>
    <RBox size={[1.3, 0.85, 0.6]} round={0.05} position={[0, 0.42, 0]} color="#f4f1ec" />
    <RBox size={[1.35, 0.06, 0.65]} round={0.2} position={[0, 0.87, 0]} color="#3c3f4a" />
    <Cyl size={[0.36, 0.1, 0.36]} position={[-0.3, 0.95, 0]} color="#c0c4cc" />
    <Cyl size={[0.42, 0.04, 0.42]} position={[0.3, 0.92, 0.05]} color="#f2c26b" />
    {[0, 1, 2, 3].map(i => <Ball key={i} size={0.07} position={[0.22 + (i % 2) * 0.15, 0.95, -0.05 + Math.floor(i / 2) * 0.15]} color="#d9473b" />)}
    <Block size={[0.04, 0.3, 0.04]} position={[-0.3, 1.1, -0.05]} color={accent} />
  </group>,
  medical: () => <group>
    <RBox size={[0.45, 1.3, 0.35]} round={0.1} position={[0, 0.65, 0]} color="#e6e8ec" />
    <RBox size={[0.4, 0.3, 0.05]} round={0.1} position={[0, 1.2, 0.18]} color="#0f1a2a" />
    <HeartLine />
    <RBox size={[0.6, 0.4, 0.5]} round={0.1} position={[0.6, 0.2, 0]} color="#ffffff" />
    <Block size={[0.2, 0.06, 0.01]} position={[0.6, 0.25, 0.26]} color="#ff3b3b" shadow={false} />
    <Block size={[0.06, 0.2, 0.01]} position={[0.6, 0.25, 0.26]} color="#ff3b3b" shadow={false} />
  </group>,
  gym: ({ accent }) => <group>
    <RBox size={[1.3, 0.05, 0.5]} round={0.2} position={[0, 0.5, 0]} color="#3a3d46" />
    {[-0.6, 0.6].map(x => <Block key={x} size={[0.06, 0.5, 0.4]} position={[x, 0.25, 0]} color="#3a3d46" />)}
    {[-0.35, 0, 0.35].map((x, i) => <group key={x} position={[x, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
      <Cyl size={[0.05, 0.36, 0.05]} color="#9aa3b2" />
      {[-0.14, 0.14].map(y => <Cyl key={y} size={[0.16 + i * 0.03, 0.06, 0.16 + i * 0.03]} position={[0, y, 0]} color={accent} />)}
    </group>)}
    <RBox size={[0.6, 0.02, 1.4]} round={0.3} position={[1.0, 0.01, 0.2]} color="#7cc6fe" shadow={false} />
  </group>,
  fashion: ({ accent }) => <group>
    <Cyl size={[0.3, 0.04, 0.3]} position={[-0.4, 0.02, 0]} color="#3a3d46" />
    <Cyl size={[0.04, 0.9, 0.04]} position={[-0.4, 0.45, 0]} color="#3a3d46" />
    <RBox size={[0.4, 0.55, 0.26]} round={0.4} position={[-0.4, 1.15, 0]} color={accent} />
    <Ball size={0.2} position={[-0.4, 1.52, 0]} color="#e8dccc" />
    <Block size={[1.0, 0.04, 0.04]} position={[0.4, 1.4, 0]} color="#c0c4cc" />
    {[0.2, 0.75].map(x => <Block key={x} size={[0.04, 1.4, 0.04]} position={[x - 0.05, 0.7, 0]} color="#c0c4cc" />)}
    {[0, 1, 2, 3].map(i => <RBox key={i} size={[0.2, 0.6, 0.1]} round={0.3} position={[0.18 + i * 0.16, 1.05, 0]} color={['#ff8fa3', '#7cc6fe', '#ffd166', '#b39ddb'][i]} />)}
  </group>,
  lectern: () => <group>
    <RBox size={[0.7, 1.0, 0.5]} round={0.06} position={[0, 0.5, 0]} color="#8a5f3e" />
    <RBox size={[0.8, 0.06, 0.6]} round={0.2} position={[0, 1.05, 0]} rotation={[0.25, 0, 0]} color="#a87c52" />
    <RBox size={[0.5, 0.04, 0.36]} round={0.2} position={[0, 1.1, 0.02]} rotation={[0.25, 0, 0]} color="#ffffff" />
    <group position={[0.65, 0, 0]}><Cyl size={[0.3, 0.05, 0.3]} position={[0, 0.65, 0]} color="#ffcf3a" material={mat('#ffcf3a', { metal: 0.6, rough: 0.3 })} />
      <Block size={[0.04, 0.6, 0.04]} position={[0, 0.35, 0]} color="#ffcf3a" material={mat('#ffcf3a', { metal: 0.6, rough: 0.3 })} />
      <Block size={[0.5, 0.03, 0.03]} position={[0, 0.66, 0]} color="#ffcf3a" material={mat('#ffcf3a', { metal: 0.6, rough: 0.3 })} /></group>
  </group>,
  energy: () => <group>
    <Block size={[0.06, 1.8, 0.06]} position={[0.35, 0.9, 0]} color="#e6e8ec" />
    <group position={[0.35, 1.8, 0.06]}><Spin speed={2.4} axis="z">{[0, 2.1, 4.2].map(a => <RBox key={a} size={[0.06, 0.55, 0.02]} round={0.4} position={[Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0]} rotation={[0, 0, -a]} color="#ffffff" />)}</Spin></group>
    <group position={[-0.3, 0.4, 0]} rotation={[-0.6, 0, 0]}>
      <RBox size={[0.8, 0.5, 0.04]} round={0.05} color="#1f3a6b" />
      {[0, 1, 2].map(i => <Block key={i} size={[0.01, 0.48, 0.045]} position={[-0.27 + i * 0.27, 0, 0]} color="#8fb8ff" shadow={false} />)}
    </group>
    <Block size={[0.05, 0.4, 0.05]} position={[-0.3, 0.2, -0.1]} color="#3a3d46" />
  </group>,
  aquarium: () => <group>
    <RBox size={[1.2, 0.6, 0.5]} round={0.05} position={[0, 0.3, 0]} color="#2b2f3a" />
    <mesh position={[0, 0.9, 0]}><boxGeometry args={[1.15, 0.6, 0.45]} /><meshStandardMaterial color="#7fd6ff" transparent opacity={0.45} emissive="#2a9fd6" emissiveIntensity={0.4} /></mesh>
    <Fish color="#ff8a3d" y={0.95} speed={0.8} />
    <Fish color="#ffd23f" y={0.8} speed={-0.6} />
    {[-0.4, 0.3].map(x => <Ball key={x} size={[0.12, 0.3, 0.12]} position={[x, 0.75, 0]} color="#3f9046" />)}
  </group>,
  car: ({ accent }) => <group>
    <RBox size={[1.3, 0.35, 0.6]} round={0.3} position={[0, 0.3, 0]} color={accent} />
    <RBox size={[0.7, 0.3, 0.55]} round={0.35} position={[-0.05, 0.58, 0]} color={accent} />
    <Block size={[0.55, 0.2, 0.56]} position={[-0.05, 0.6, 0]} color="#8fd3ff" material={mat('#8fd3ff', { opacity: 0.7 })} />
    {[-0.4, 0.4].flatMap(x => [-0.3, 0.3].map(z => <Cyl key={`${x}${z}`} size={[0.26, 0.1, 0.26]} rotation={[Math.PI / 2, 0, 0]} position={[x, 0.13, z]} color="#22252e" />))}
  </group>,
  dish: () => <group>
    <Cyl size={[0.3, 0.6, 0.3]} position={[0, 0.3, 0]} color="#e6e8ec" />
    <group position={[0, 0.8, 0]} rotation={[-0.7, 0, 0]}><Spin speed={0.3}>
      <Cyl size={[1.0, 0.15, 1.0]} top={0.5} bottom={0.3} color="#f4f1ec" />
      <Cyl size={[0.03, 0.5, 0.03]} position={[0, 0.3, 0]} color="#3a3d46" />
      <Blink position={[0, 0.56, 0]} color="#ff5d5d" speed={3} />
    </Spin></group>
  </group>,
  trophies: () => <group>
    <RBox size={[1.3, 0.9, 0.45]} round={0.05} position={[0, 0.45, 0]} color="#8a5f3e" />
    {[-0.4, 0, 0.4].map((x, i) => <group key={x} position={[x, 0.9, 0]}>
      <Cyl size={[0.16, 0.06, 0.16]} position={[0, 0.03, 0]} color="#3a3d46" />
      <Cyl size={[0.05, 0.14, 0.05]} position={[0, 0.13, 0]} color="#ffcf3a" material={mat(['#ffcf3a', '#d8dde6', '#d08a4a'][i], { metal: 0.7, rough: 0.25 })} />
      <Cyl size={[0.26, 0.24, 0.26]} top={0.5} bottom={0.25} position={[0, 0.32, 0]} color="#ffcf3a" material={mat(['#ffcf3a', '#d8dde6', '#d08a4a'][i], { metal: 0.7, rough: 0.25 })} />
    </group>)}
  </group>,
  mic: ({ accent }) => <group>
    <Cyl size={[0.3, 0.04, 0.3]} position={[0, 0.02, 0]} color="#3a3d46" />
    <Cyl size={[0.03, 1.2, 0.03]} position={[0, 0.6, 0]} color="#3a3d46" />
    <Ball size={[0.16, 0.24, 0.16]} position={[0, 1.3, 0.05]} color="#9aa3b2" />
    <RBox size={[0.9, 0.3, 0.06]} round={0.3} position={[0.6, 1.6, -0.1]} color="#1c1d22" />
    <Block size={[0.8, 0.2, 0.01]} position={[0.6, 1.6, -0.065]} color={accent} material={mat('#ff3b3b', { emissive: '#ff3b3b', glow: 1.6 })} shadow={false} />
  </group>,
  drafting: () => <group>
    {[-0.5, 0.5].map(x => <Block key={x} size={[0.05, 0.8, 0.05]} position={[x, 0.4, 0]} color="#3a3d46" />)}
    <RBox size={[1.3, 0.04, 0.9]} round={0.1} position={[0, 0.85, 0]} rotation={[0.3, 0, 0]} color="#4a7fd1" />
    {Array.from({ length: 5 }, (_, i) => <Block key={i} size={[0.9 - (i % 2) * 0.3, 0.005, 0.015]} position={[-0.1, 0.89 + i * 0.03, -0.3 + i * 0.13]} rotation={[0.3, 0, 0]} color="#ffffff" shadow={false} />)}
    <Cyl size={[0.06, 0.6, 0.06]} rotation={[0, 0, Math.PI / 2]} position={[0.3, 0.95, 0.35]} color="#f4f1ec" />
  </group>,
  cones: () => <group>
    {[[-0.35, 0], [0.1, 0.2], [0.45, -0.1]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <RBox size={[0.36, 0.04, 0.36]} round={0.2} position={[0, 0.02, 0]} color="#ff7a1a" />
      <Cyl size={[0.28, 0.5, 0.28]} top={0.08} bottom={0.5} position={[0, 0.27, 0]} color="#ff7a1a" />
      <Cyl size={[0.2, 0.08, 0.2]} top={0.4} bottom={0.45} position={[0, 0.3, 0]} color="#ffffff" />
    </group>)}
    <Ball size={[0.45, 0.25, 0.5]} position={[0.1, 0.13, -0.35]} color="#ffd23f" />
  </group>,
  pets: ({ accent }) => <group>
    <Cyl size={[0.9, 0.18, 0.7]} position={[-0.2, 0.09, 0]} color={accent} />
    <Cyl size={[0.7, 0.1, 0.5]} position={[-0.2, 0.18, 0]} color="#f4efe6" />
    <Ball size={[0.4, 0.3, 0.32]} position={[-0.2, 0.33, 0]} color="#e8a35c" />
    <Ball size={[0.22, 0.2, 0.2]} position={[-0.02, 0.42, 0.04]} color="#e8a35c" />
    <Block size={[0.12, 1.2, 0.12]} position={[0.55, 0.6, 0]} color="#d9b98c" />
    {[0.4, 0.9].map(y => <RBox key={y} size={[0.5, 0.06, 0.45]} round={0.2} position={[0.55, y, 0]} color={accent} />)}
  </group>,
  balloons: () => <group>
    {['#ff5d8f', '#ffd23f', '#3bceac', '#4f8cff', '#b06bff'].map((color, i) => <Bob key={i} phase={i}>
      <Ball size={[0.32, 0.38, 0.32]} position={[-0.4 + i * 0.2, 1.2 + (i % 2) * 0.25, (i % 3) * 0.1]} color={color} material={mat(color, { rough: 0.25 })} />
      <Block size={[0.008, 1.0, 0.008]} position={[-0.4 + i * 0.2, 0.55 + (i % 2) * 0.12, (i % 3) * 0.1]} color="#ffffff" shadow={false} />
    </Bob>)}
    <RBox size={[0.3, 0.12, 0.3]} round={0.2} position={[0, 0.06, 0.1]} color="#3a3d46" />
  </group>,
  chalkboard: () => <group>
    {[-0.75, 0.75].map(x => <Block key={x} size={[0.05, 1.9, 0.05]} position={[x, 0.95, -0.06]} color="#9aa3b2" />)}
    <RBox size={[1.8, 1.1, 0.06]} round={0.06} position={[0, 1.35, 0]} color="#8a5f3e" />
    <Block size={[1.68, 0.98, 0.01]} position={[0, 1.35, 0.035]} color="#2f4a3a" shadow={false} />
    {Array.from({ length: 5 }, (_, i) => <Block key={i} size={[0.35 + ((i * 37) % 9) / 10, 0.025, 0.005]} position={[-0.4 + (i % 2) * 0.3, 1.65 - i * 0.14, 0.042]} color="#f4f1ec" shadow={false} />)}
    <Ball size={[0.3, 0.3, 0.01]} position={[0.55, 1.3, 0.042]} color="#f4f1ec" />
    <Ball size={[0.26, 0.26, 0.012]} position={[0.55, 1.3, 0.044]} color="#2f4a3a" />
  </group>,
  duck: () => <group>
    <Ball size={[0.7, 0.55, 0.8]} position={[0, 0.3, 0]} color="#ffd23f" />
    <Ball size={0.42} position={[0, 0.72, 0.22]} color="#ffd23f" />
    <RBox size={[0.22, 0.08, 0.2]} round={0.5} position={[0, 0.68, 0.48]} color="#ff8a3d" />
    {[-1, 1].map(s => <Ball key={s} size={0.06} position={[s * 0.12, 0.8, 0.4]} color="#1b1b22" />)}
  </group>,
  kanban: () => <group>
    {[-0.75, 0.75].map(x => <Block key={x} size={[0.05, 1.9, 0.05]} position={[x, 0.95, -0.06]} color="#9aa3b2" />)}
    <RBox size={[1.8, 1.1, 0.05]} round={0.05} position={[0, 1.35, 0]} color="#ffffff" />
    {[0, 1, 2].map(col => Array.from({ length: 3 - (col === 2 ? 1 : 0) }, (_, row) => <Block key={`${col}${row}`} size={[0.4, 0.22, 0.01]} position={[-0.55 + col * 0.55, 1.62 - row * 0.3, 0.03]} rotation={[0, 0, ((col + row) % 3 - 1) * 0.05]} color={['#ffd166', '#7cc6fe', '#9be29b'][col]} shadow={false} />))}
  </group>,
  drone: () => <group>
    <RBox size={[0.6, 0.06, 0.6]} round={0.3} position={[0, 0.03, 0]} color="#3a3d46" />
    <Bob phase={0} amount={0.08}><group position={[0, 1.0, 0]}>
      <RBox size={[0.3, 0.1, 0.3]} round={0.3} color="#2b2f3a" />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => <group key={`${x}${z}`} position={[x * 0.22, 0.04, z * 0.22]}>
        <Spin speed={30}><Block size={[0.3, 0.01, 0.04]} color="#c0c4cc" shadow={false} /></Spin>
      </group>)}
      <Blink position={[0, -0.06, 0.15]} color="#46e08a" speed={6} />
    </group></Bob>
  </group>,
};

function HeartLine() {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.x = ((clock.elapsedTime * 0.25) % 0.3) - 0.15; });
  return <mesh ref={ref} position={[0, 1.2, 0.21]} scale={[0.06, 0.12, 0.01]}><boxGeometry /><meshStandardMaterial color="#46e08a" emissive="#46e08a" emissiveIntensity={1.8} /></mesh>;
}
function Fish({ color, y, speed }: { color: string; y: number; speed: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (!ref.current) return; const t = clock.elapsedTime * speed; ref.current.position.set(Math.sin(t) * 0.42, y + Math.sin(t * 3) * 0.03, Math.cos(t * 1.3) * 0.08); ref.current.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI; });
  return <group ref={ref}><Ball size={[0.14, 0.08, 0.05]} color={color} /><Ball size={[0.05, 0.07, 0.02]} position={[-0.08, 0, 0]} color={color} /></group>;
}
function Bob({ children, phase = 0, amount = 0.05 }: { children: React.ReactNode; phase?: number; amount?: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * 1.5 + phase) * amount; });
  return <group ref={ref}>{children}</group>;
}

/** Which signature pieces each topic gets. Unlisted topics fall back by family. */
const kits: Record<string, string[]> = {
  software: ['server', 'duck', 'kanban'], ai: ['robot', 'server', 'chalkboard'], security: ['vault', 'server', 'camera'],
  finance: ['ticker', 'vault', 'trophies'], crypto: ['server', 'ticker', 'vault'], commerce: ['parcels', 'fashion', 'ticker'],
  health: ['medical', 'microscope', 'planters'], biotech: ['flasks', 'microscope', 'medical'], education: ['chalkboard', 'globe', 'lectern'],
  games: ['arcade', 'trophies', 'balloons'], music: ['guitar', 'mic', 'trophies'], film: ['camera', 'mic', 'balloons'],
  architecture: ['drafting', 'easel', 'planters'], construction: ['cones', 'drafting', 'parcels'], robotics: ['robot', 'drone', 'server'],
  aerospace: ['rocket', 'telescope', 'dish'], astronomy: ['telescope', 'rocket', 'globe'], automotive: ['car', 'cones', 'trophies'],
  logistics: ['parcels', 'globe', 'kanban'], travel: ['globe', 'parcels', 'camera'], hospitality: ['kitchen', 'planters', 'balloons'],
  food: ['kitchen', 'planters', 'trophies'], agriculture: ['planters', 'energy', 'drone'], climate: ['energy', 'planters', 'globe'],
  energy: ['energy', 'server', 'ticker'], ocean: ['aquarium', 'globe', 'dish'], sports: ['trophies', 'gym', 'balloons'],
  fitness: ['gym', 'trophies', 'planters'], fashion: ['fashion', 'easel', 'mic'], beauty: ['fashion', 'planters', 'camera'],
  property: ['drafting', 'planters', 'ticker'], legal: ['lectern', 'vault', 'kanban'], marketing: ['mic', 'ticker', 'balloons'],
  social: ['mic', 'balloons', 'camera'], news: ['mic', 'dish', 'globe'], photography: ['camera', 'easel', 'planters'],
  publishing: ['lectern', 'chalkboard', 'kanban'], geospatial: ['globe', 'dish', 'drone'], telecom: ['dish', 'server', 'ticker'],
  iot: ['drone', 'server', 'robot'], manufacturing: ['robot', 'parcels', 'cones'], chemistry: ['flasks', 'microscope', 'chalkboard'],
  physics: ['chalkboard', 'telescope', 'flasks'], mathematics: ['chalkboard', 'lectern', 'kanban'], art: ['easel', 'planters', 'camera'],
  pets: ['pets', 'aquarium', 'planters'], gardening: ['planters', 'pets', 'energy'], events: ['balloons', 'mic', 'trophies'],
  civic: ['lectern', 'kanban', 'globe'], productivity: ['kanban', 'duck', 'chalkboard'],
};

export function verticalOf(project: { name: string; vertical?: string }) {
  const id = project.vertical && verticalById.has(project.vertical) ? project.vertical : suggestedVertical(project.name);
  return verticalById.get(id) ?? verticalById.get('software')!;
}

export function ThemeProp({ kind, color, accent }: { kind: string; color: string; accent: string }) {
  const make = makers[kind] ?? makers.kanban;
  return make({ color, accent });
}

export function themeKit(verticalId: string) { return kits[verticalId] ?? kits.software; }
