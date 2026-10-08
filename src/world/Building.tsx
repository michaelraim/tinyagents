import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { MathUtils, Vector3, type Group } from 'three';
import { CORRIDOR_WIDTH, WALL, type Building as Plan, type Room } from '../../shared/building';
import { Ball, RBox, box, mat } from './kit';
import { projectColor, world as c } from './palette';
import { Arcade, DeskPod, PingPong, Tv, Whiteboard } from './Furniture';
import { summarizeAgents, type Agent } from '../../shared/protocol';
import { ThemeProp, themeKit, verticalOf } from './Themes';
import { Kit } from './assets';
import { NeonOutline, NeonSign, NeonStrip } from './Neon';
import { Batched, NoBatch } from './Batched';

/** Static furniture is merged per room; rebuild when the room's contents change. */
const batchVersion = (room: Room, night: boolean) => [room.id, room.x, room.z, room.w, room.d, room.slot, room.project?.vertical ?? '', night,
  room.pods.map(p => `${p.id}:${p.columns}:${p.x}:${p.z}`).join(','), room.decor.length].join('|');

const WALL_HEIGHT = 1.55;
const LOW_WALL = 0.28;
const DISPLAY_FONT = '/fonts/silkscreen-700.woff';
const BODY_FONT = '/fonts/tiny5-400.woff';

const cameraDir = new Vector3();
const boxGeo = box();

/**
 * A straight wall from a to b along x or z. When the camera looks at the room
 * through this wall, it sinks down to a stub, like a cutaway dollhouse.
 */
function Wall({ from, to, at, axis, normal, windows = false, gaps = [], night = false }: {
  from: number; to: number; at: number; axis: 'x' | 'z'; normal: [number, number]; windows?: boolean; gaps?: { center: number; width: number }[]; night?: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame(({ camera }, dt) => {
    if (!group.current) return;
    camera.getWorldDirection(cameraDir);
    // Facing the camera when the camera looks against the wall's outward normal.
    const facing = -(cameraDir.x * normal[0] + cameraDir.z * normal[1]);
    const target = facing > 0.25 ? LOW_WALL / WALL_HEIGHT : 1;
    group.current.scale.y = MathUtils.damp(group.current.scale.y, target, 6, dt);
  });
  // Split the run around door gaps.
  const runs: [number, number][] = [];
  let start = Math.min(from, to);
  const end = Math.max(from, to);
  for (const gap of [...gaps].sort((a, b) => a.center - b.center)) {
    const g0 = gap.center - gap.width / 2, g1 = gap.center + gap.width / 2;
    if (g0 > start) runs.push([start, g0]);
    start = Math.max(start, g1);
  }
  if (end > start) runs.push([start, end]);
  const wall = mat(c.wall, { rough: 0.95 });
  const cap = mat(c.wallTop, { rough: 0.6 });
  const glass = night ? mat('#ffd9a0', { rough: 0.1, opacity: 0.85, emissive: '#ffb85c', glow: 1.1 }) : mat(c.glass, { rough: 0.1, opacity: 0.45, emissive: '#bfe6ff', glow: 0.15 });
  return <group ref={group}>
    {runs.map(([a, b], i) => {
      const length = b - a, mid = (a + b) / 2;
      const pos = (y: number): [number, number, number] => axis === 'x' ? [mid, y, at] : [at, y, mid];
      const size = (h: number, t = WALL): [number, number, number] => axis === 'x' ? [length, h, t] : [t, h, length];
      if (!windows || length < 2.4) return <group key={i}>
        <mesh material={wall} position={pos(WALL_HEIGHT / 2)} scale={size(WALL_HEIGHT)} castShadow receiveShadow geometry={boxGeo} />
        <mesh material={cap} position={pos(WALL_HEIGHT + 0.02)} scale={size(0.04, WALL + 0.04)} geometry={boxGeo} />
      </group>;
      // Window band: solid sill, glass, solid header, with mullions.
      const panes = Math.max(1, Math.floor(length / 1.6));
      return <group key={i}>
        <mesh material={wall} position={pos(0.35)} scale={size(0.7)} castShadow receiveShadow geometry={boxGeo} />
        <mesh material={glass} position={pos(0.98)} scale={size(0.56, 0.06)} geometry={boxGeo} />
        <mesh material={wall} position={pos(1.405)} scale={size(0.29)} castShadow receiveShadow geometry={boxGeo} />
        <mesh material={cap} position={pos(WALL_HEIGHT + 0.02)} scale={size(0.04, WALL + 0.04)} geometry={boxGeo} />
        {Array.from({ length: panes + 1 }, (_, k) => {
          const p = a + (k * length) / panes;
          return <mesh key={k} material={wall} position={axis === 'x' ? [p, 0.98, at] : [at, 0.98, p]} scale={axis === 'x' ? [0.08, 0.56, WALL] : [WALL, 0.56, 0.08]} geometry={boxGeo} />;
        })}
      </group>;
    })}
  </group>;
}

function Floor({ x, z, w, d, color, y = 0 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return <mesh material={mat(color, { rough: 0.9 })} position={[x, y - 0.05, z]} scale={[w, 0.1, d]} receiveShadow geometry={boxGeo} />;
}

function Planks({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const lines = Math.floor(d / 0.5);
  return <group>
    <Floor x={x} z={z} w={w} d={d} color={c.corridor} />
    {Array.from({ length: lines }, (_, i) => <mesh key={i} material={mat(c.corridorPlank)} position={[x, 0.002, z - d / 2 + (i + 1) * (d / (lines + 1))]} scale={[w, 0.004, 0.02]} geometry={boxGeo} />)}
  </group>;
}

function Checker({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const size = 1;
  const tiles: [number, number][] = [];
  for (let i = 0; i < Math.floor(w / size); i++) for (let k = 0; k < Math.floor(d / size); k++) if ((i + k) % 2 === 0) tiles.push([i, k]);
  return <group>
    <Floor x={x} z={z} w={w} d={d} color="#3f3b5c" />
    {tiles.map(([i, k]) => <mesh key={`${i}:${k}`} material={mat('#36324f')} position={[x - w / 2 + (i + 0.5) * size, 0.002, z - d / 2 + (k + 0.5) * size]} scale={[size, 0.004, size]} geometry={boxGeo} />)}
  </group>;
}

function RoomLabel({ room, agents, now, onSelect }: { room: Room; agents: Agent[]; now: number; onSelect: () => void }) {
  const outside = room.z + room.side * (room.d / 2 + 1.1);
  const guest = agents.find(a => a.visitingOfficeId)?.officeName;
  const title = room.kind === 'project' ? room.project!.name : room.kind === 'cafe' ? 'Café' : room.kind === 'lounge' ? 'Lounge' : 'Lobby';
  const summary = summarizeAgents(agents, now);
  const color = room.kind === 'project' ? projectColor(room.slot).carpet : '#c9c2e8';
  const subtitle = room.kind !== 'project'
    ? ''
    : [guest ? `from ${guest}` : '', `${summary.total} ${summary.total === 1 ? 'agent' : 'agents'}`,
      summary.running ? `${summary.running} working` : '',
      summary.counts.waiting ? `${summary.counts.waiting} need${summary.counts.waiting === 1 ? 's' : ''} you` : '',
      summary.counts.blocked ? `${summary.counts.blocked} stuck` : ''].filter(Boolean).join(' · ');
  const anchorX = room.x - room.w / 2 + 0.4;
  // South rooms: painted on the ground outside, facing the default camera.
  // North rooms: painted on the corridor floor in front of their wall, so they're never hidden.
  const z = room.side > 0 ? outside - 0.1 : -CORRIDOR_WIDTH / 2 + 0.35;
  const small = room.side < 0;
  return <group position={[anchorX, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} onClick={e => { e.stopPropagation(); onSelect(); }}>
    <Text font={DISPLAY_FONT} fontSize={(room.kind === 'project' ? 0.78 : 0.6) * (small ? 0.75 : 1)} color={small ? '#3b3452' : '#ffffff'} anchorX="left" anchorY="top" letterSpacing={-0.01}
      outlineWidth={0} maxWidth={Math.max(8, room.w * 1.2)}>
      {title}
    </Text>
    {subtitle && <Text font={BODY_FONT} fontSize={small ? 0.34 : 0.42} color={summary.counts.waiting ? (small ? '#c27800' : '#ffc247') : small ? projectColor(room.slot).accent : color} anchorX="left" anchorY="top" position={[0.04, small ? -0.86 : -1.2, 0]}>
      {subtitle}
    </Text>}
  </group>;
}

function Decor({ item, night, accent, carpet, vertical }: { item: Room['decor'][number]; night: boolean; accent: string; carpet: string; vertical: ReturnType<typeof verticalOf> }) {
  const at: [number, number, number] = [item.x, 0, item.z];
  // Seat furniture is placed by its backrest; nudge the model forward so the seat sits in front.
  const forward = (d: number): [number, number, number] => [item.x + Math.sin(item.rot) * d, 0, item.z + Math.cos(item.rot) * d];
  switch (item.kind) {
    case 'whiteboard': return <Whiteboard position={at} rotation={item.rot} />;
    case 'bookshelf': return <group><Kit name="bookcaseOpen" position={[item.x - 0.4, 0, item.z]} rotation={item.rot} /><Kit name="bookcaseOpen" position={[item.x + 0.4, 0, item.z]} rotation={item.rot} /></group>;
    case 'plant': return <Kit name="plantSmall2" position={at} scale={1.4} />;
    case 'plant-tall': return <Kit name="pottedPlant" position={at} scale={1.3} />;
    case 'rug': return <Kit name="rugRounded" position={[item.x, 0.01, item.z]} scale={[item.w / 2.75, 1, item.d / 1.6]} tint={carpet} />;
    case 'sofa': return <Kit name="loungeSofa" position={forward(0.12)} rotation={item.rot} scale={[item.d / 1.7, 1, 1]} tint={accent} />;
    case 'armchair': return <Kit name="loungeChair" position={forward(0.15)} rotation={item.rot} />;
    case 'coffee-table': return <group><Kit name="tableCoffee" position={at} rotation={Math.PI / 2} scale={0.85} /><Kit name="books" position={[item.x, 0.32, item.z]} scale={0.6} /></group>;
    case 'lamp': return <group><Kit name="lampRoundFloor" position={at} scale={1.2} />{night && <pointLight position={[item.x, 1.4, item.z]} intensity={4} distance={4.5} color="#ffc977" />}</group>;
    case 'tv': return <Tv position={[item.x, 1.3, item.z]} rotation={item.rot} color={accent} />;
    case 'feature': return <NoBatch><group position={at} rotation={[0, item.rot, 0]}><ThemeProp kind={themeKit(vertical.id)[item.slot ?? 0]} color={carpet} accent={accent} /></group></NoBatch>;
    case 'plant-small': return <Kit name="plantSmall3" position={at} scale={1.7} />;
    case 'wall-shelf': return <group position={[item.x, 1.32, item.z]} rotation={[0, item.rot, 0]}>
      <RBox size={[1.4, 0.06, 0.24]} round={0.2} color="#8a5f3e" />
      {[-0.45, 0, 0.45].map(x => <Kit key={x} name={x === 0 ? 'books' : 'plantSmall1'} position={[x, 0.03, 0]} scale={1.1} />)}
    </group>;
    case 'coatrack': return <Kit name="coatRackStanding" position={at} scale={1.25} />;
    case 'cabinet': return <Kit name="bookcaseClosedWide" position={at} rotation={item.rot} scale={[1, 0.75, 1]} tint="#4b4f7a" />;
    case 'cooler': return <group position={at}>
      <RBox size={[0.5, 0.85, 0.5]} round={0.15} position={[0, 0.43, 0]} color="#e6e8ec" />
      <mesh position={[0, 1.08, 0]} material={mat('#8fd3ff', { opacity: 0.75, rough: 0.1, emissive: '#3ec8ff', glow: 0.3 })}><cylinderGeometry args={[0.18, 0.18, 0.45, 16]} /></mesh>
    </group>;
    case 'bin': return <Kit name="trashcan" position={at} scale={1.2} />;
    case 'poster': return <group position={[item.x, 1.0, item.z]} rotation={[0, item.rot, 0]}>
      <RBox size={[0.7, 0.9, 0.03]} round={0.1} color="#16142c" />
      <mesh position={[0, 0, 0.02]}><planeGeometry args={[0.6, 0.8]} /><meshStandardMaterial color={item.slot ? accent : carpet} emissive={item.slot ? accent : carpet} emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 0.08, 0.025]}><circleGeometry args={[0.18, 24]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      <mesh position={[0, -0.24, 0.025]}><planeGeometry args={[0.4, 0.06]} /><meshBasicMaterial color="#ffffff" /></mesh>
    </group>;
    default: return null;
  }
}

function ProjectRoom({ room, activeKeys, night }: { room: Room; activeKeys: Set<string>; night: boolean }) {
  const color = projectColor(room.slot);
  const vertical = verticalOf(room.project!);
  const s = room.side;
  const chairs = useMemo(() => ['#3b3f63', color.accent], [color.accent]);
  const carpet = { x: room.x, z: room.z, w: room.w - 1.0, d: room.d - 1.0 };
  const backZ = room.z + s * room.d / 2, corridorZ = room.z - s * room.d / 2;
  const signX = room.x + room.w * 0.12;
  const name = room.project!.name;
  return <group>
    <RBox size={[carpet.w, 0.03, carpet.d]} round={0.05} position={[room.x, 0.015, room.z]} color={color.carpet} shadow={false} />
    <NeonOutline rect={carpet} color={color.carpet} inset={0.18} intensity={night ? 2.4 : 0.8} />
    {/* The room's neon sign hangs on whichever long wall the camera can see. */}
    <NeonSign text={name} icon={vertical.icon} color={color.carpet} position={[signX, 1.05, backZ - s * 0.13]} rotation={s > 0 ? Math.PI : 0} wallNormal={[0, s]} height={0.62} />
    <NeonSign text={name} icon={vertical.icon} color={color.carpet} position={[signX, 1.05, corridorZ + s * 0.13]} rotation={s > 0 ? 0 : Math.PI} wallNormal={[0, -s]} height={0.62} />
    {room.pods.map(pod => <DeskPod key={pod.id} x={pod.x} z={pod.z} columns={pod.columns} chairColors={chairs}
      active={Array.from({ length: pod.columns * 2 }, (_, k) => !!pod.seats[k] && activeKeys.has(pod.seats[k].agent.key))} />)}
    {room.decor.map((item, i) => <Decor key={i} item={item} night={night} accent={color.accent} carpet={color.carpet} vertical={vertical} />)}
  </group>;
}

function Cafe({ room, night }: { room: Room; night: boolean }) {
  const s = room.side, back = room.z + s * room.d / 2, inward = -s, left = room.x - room.w / 2, right = room.x + room.w / 2;
  const faceIn = s > 0 ? Math.PI : 0;
  const tables = Math.max(2, Math.floor((room.w - 3) / 4));
  const counter = room.w - 2.4, unit = 0.87;
  const units = Math.floor(counter / unit);
  return <group>
    <Checker x={room.x} z={room.z} w={room.w - WALL} d={room.d - WALL} />
    {/* Kitchen run along the far wall: cabinets, coffee machine, microwave, fridge. */}
    {Array.from({ length: units }, (_, i) => {
      const x = room.x - counter / 2 + unit / 2 + i * unit;
      return <group key={i}>
        <Kit name={i % 3 === 1 ? 'kitchenSink' : 'kitchenCabinetDrawer'} position={[x, 0, back + inward * 0.5]} rotation={faceIn} />
        {i === 0 && <Kit name="kitchenCoffeeMachine" position={[x, 0.75, back + inward * 0.45]} rotation={faceIn} scale={1.3} />}
        {i === 2 && <Kit name="kitchenMicrowave" position={[x, 0.75, back + inward * 0.45]} rotation={faceIn} />}
        {i === 3 && <Kit name="toaster" position={[x, 0.75, back + inward * 0.5]} rotation={faceIn} />}
      </group>;
    })}
    <Kit name="kitchenFridgeLarge" position={[right - 0.7, 0, back + inward * 0.5]} rotation={faceIn} />
    {Array.from({ length: tables }, (_, i) => {
      const tx = left + 2.2 + i * ((room.w - 4.4) / Math.max(1, tables - 1));
      const tz = room.z + inward * 1.2;
      return <group key={i}>
        <Kit name="tableRound" position={[tx, 0, tz]} />
        <Kit name="stoolBar" position={[tx - 1.05, 0, tz]} />
        <Kit name="stoolBar" position={[tx + 1.05, 0, tz]} />
      </group>;
    })}
    <Kit name="pottedPlant" position={[right - 0.6, 0, room.z - s * (room.d / 2 - 0.6)]} scale={1.3} />
    <Kit name="plantSmall3" position={[left + 0.6, 0, room.z - s * (room.d / 2 - 0.6)]} scale={1.5} />
    <NeonSign text="COFFEE" icon="☕" color="#ff4fd8" position={[room.x + 1.5, 1.2, back - s * 0.13]} rotation={s > 0 ? Math.PI : 0} wallNormal={[0, s]} height={0.5} />
    <NeonSign text="COFFEE" icon="☕" color="#ff4fd8" position={[room.x + 1.5, 1.2, room.z - s * room.d / 2 + s * 0.13]} rotation={s > 0 ? 0 : Math.PI} wallNormal={[0, -s]} height={0.5} />
    {night && <pointLight position={[room.x, 1.5, back + inward * 1]} intensity={6} distance={6} color="#ff8ad8" />}
  </group>;
}

function Lounge({ room, night }: { room: Room; night: boolean }) {
  const s = room.side, back = room.z + s * room.d / 2, inward = -s, left = room.x - room.w / 2, right = room.x + room.w / 2;
  const faceIn = s > 0 ? Math.PI : 0;
  return <group>
    <Floor x={room.x} z={room.z} w={room.w - WALL} d={room.d - WALL} color="#3d3560" />
    <Kit name="rugRounded" position={[left + 3.2, 0.01, back + inward * 2.0]} scale={[1.9, 1, 2]} tint="#7b5cff" />
    <Kit name="loungeSofaLong" position={[left + 3.2, 0, back + inward * 0.62]} rotation={faceIn} scale={[1.6, 1, 1]} tint="#ff4fd8" />
    <Kit name="tableCoffee" position={[left + 3.2, 0, back + inward * 2.5]} scale={1.1} />
    <Kit name="loungeChair" position={[left + 0.9, 0, back + inward * 2.6]} rotation={faceIn + (s > 0 ? -1 : 1) * Math.PI / 2} tint="#3ee8ff" />
    <PingPong position={[room.x + 2, 0, room.z + inward * 0.6]} />
    <Arcade position={[right - 1.2, 0, back + inward * 0.6]} rotation={faceIn} color="#6c4fd6" />
    <Arcade position={[right - 2.6, 0, back + inward * 0.6]} rotation={faceIn} color="#ef6b8a" />
    <Kit name="pottedPlant" position={[right - 0.6, 0, room.z - s * (room.d / 2 - 0.7)]} scale={1.3} />
    <Kit name="lampRoundFloor" position={[left + 0.6, 0, room.z - s * (room.d / 2 - 0.8)]} scale={1.2} />
    {[0, 1, 2].map(i => <Ball key={i} size={[0.85, 0.55, 0.85]} position={[room.x - 2.4 + i * 1.1, 0.27, room.z - s * (room.d / 2 - 1.3)]} color={['#ff4fd8', '#3ee8ff', '#ffd23f'][i]} />)}
    <Kit name="cabinetTelevision" position={[left + 0.35, 0, room.z + inward * 0.4]} rotation={Math.PI / 2} />
    <Kit name="televisionModern" position={[left + 0.35, 0.62, room.z + inward * 0.4]} rotation={Math.PI / 2} scale={1.4} />
    <Kit name="speaker" position={[left + 0.35, 0, room.z + inward * 1.8]} rotation={Math.PI / 2} />
    <Kit name="bookcaseOpen" position={[right - 0.3, 0, room.z + inward * 0.2]} rotation={-Math.PI / 2} />
    <NeonSign text="CHILL ZONE" icon="🕹️" color="#3ee8ff" position={[room.x, 1.2, back - s * 0.13]} rotation={s > 0 ? Math.PI : 0} wallNormal={[0, s]} height={0.5} />
    <NeonSign text="CHILL ZONE" icon="🕹️" color="#3ee8ff" position={[room.x, 1.2, room.z - s * room.d / 2 + s * 0.13]} rotation={s > 0 ? 0 : Math.PI} wallNormal={[0, -s]} height={0.5} />
    {night && <pointLight position={[room.x, 1.6, room.z]} intensity={8} distance={8} color="#7b5cff" />}
  </group>;
}

function Lobby({ room, plan, night }: { room: Room; plan: Plan; night: boolean }) {
  const left = room.x - room.w / 2, right = room.x + room.w / 2;
  return <group>
    <Floor x={room.x} z={room.z} w={room.w - WALL} d={room.d - WALL} color="#433e63" />
    <Kit name="rugRectangle" position={[room.x + 1.5, 0.01, room.z + 1.4]} scale={[1.6, 1, 1.6]} tint="#ff4fd8" />
    {/* Reception desk with a glowing front strip */}
    <RBox size={[3.4, 0.95, 1.1]} round={0.12} position={[room.x + 1.5, 0.475, room.z - 0.4]} color="#26244a" />
    <RBox size={[3.5, 0.06, 1.2]} round={0.3} position={[room.x + 1.5, 0.97, room.z - 0.4]} color="#4b4f80" />
    <NeonStrip from={[room.x - 0.2, room.z + 0.17]} to={[room.x + 3.2, room.z + 0.17]} y={0.75} color="#ff4fd8" />
    <Kit name="computerScreen" position={[room.x + 1.0, 1.0, room.z - 0.55]} rotation={Math.PI} />
    <Kit name="kitchenCoffeeMachine" position={[left + 1, 0, room.z - room.d / 2 + 2.2]} rotation={Math.PI / 2} scale={1.6} />
    <Kit name="benchCushion" position={[right - 1, 0, room.z + 1.5]} rotation={-Math.PI / 2} scale={1.3} tint="#3ee8ff" />
    <Kit name="pottedPlant" position={[right - 0.6, 0, room.z - room.d / 2 + 0.7]} scale={1.4} />
    <Kit name="pottedPlant" position={[left + 0.6, 0, room.z + room.d / 2 - 0.6]} scale={1.2} />
    <Kit name="coatRackStanding" position={[left + 0.6, 0, room.z + 1.2]} scale={1.3} />
    {night && <pointLight position={[room.x, 2.2, room.z]} intensity={10} distance={8} color="#ffd29a" />}
  </group>;
}
export function BuildingView({ plan, agentsByRoom, activeKeys, now, night, onSelectRoom }: {
  plan: Plan; agentsByRoom: Map<string, Agent[]>; activeKeys: Set<string>; now: number; night: boolean; onSelectRoom: (id: string) => void;
}) {
  const { corridor } = plan;
  const lobby = plan.rooms.find(r => r.kind === 'lobby')!;
  return <group>
    {/* Plinth under every room and the corridor gives the building a crisp edge against the grid. */}
    {[corridor, ...plan.rooms].map((r, i) => <mesh key={i} material={mat('#1c1a33')} position={[r.x, -0.16, r.z]} scale={[r.w + 0.5, 0.22, r.d + (i === 0 ? 0 : 0.5)]} receiveShadow geometry={boxGeo} />)}
    <Planks x={corridor.x} z={corridor.z} w={corridor.w} d={corridor.d} />
    {/* Corridor end walls */}
    <Wall axis="z" at={0} from={-CORRIDOR_WIDTH / 2} to={CORRIDOR_WIDTH / 2} normal={[-1, 0]} windows />
    <Wall axis="z" at={corridor.w} from={-CORRIDOR_WIDTH / 2} to={CORRIDOR_WIDTH / 2} normal={[1, 0]} windows />
    {/* Corridor plants */}
    {Array.from({ length: Math.floor(corridor.w / 7) }, (_, i) => <Kit key={i} name={i % 2 ? 'pottedPlant' : 'plantSmall1'} position={[3.5 + i * 7, 0, (i % 2 ? 1 : -1) * (CORRIDOR_WIDTH / 2 - 0.45)]} scale={i % 2 ? 1.2 : 1.6} />)}
    <NeonStrip from={[0.3, -CORRIDOR_WIDTH / 2 + 0.22]} to={[corridor.w - 0.3, -CORRIDOR_WIDTH / 2 + 0.22]} color="#3ee8ff" intensity={night ? 2.2 : 0.6} thickness={0.035} />
    <NeonStrip from={[0.3, CORRIDOR_WIDTH / 2 - 0.22]} to={[corridor.w - 0.3, CORRIDOR_WIDTH / 2 - 0.22]} color="#ff4fd8" intensity={night ? 2.2 : 0.6} thickness={0.035} />
    {plan.rooms.map(room => {
      const s = room.side;
      const corridorZ = room.z - s * room.d / 2, backZ = room.z + s * room.d / 2;
      const left = room.x - room.w / 2, right = room.x + room.w / 2;
      const sideLength = Math.max(room.d, room.previousDepth);
      const isLobby = room.kind === 'lobby';
      return <group key={room.id}>
        {room.kind === 'project' && <Floor x={room.x} z={room.z} w={room.w - WALL} d={room.d - WALL} color={c.roomFloor} />}
        <Wall axis="x" at={corridorZ} from={left} to={right} normal={[0, -s]} gaps={[{ center: room.door.x, width: 1.8 }]} />
        <Wall axis="x" at={backZ} from={left} to={right} normal={[0, s]} night={night} windows={!isLobby} gaps={isLobby ? [{ center: plan.entrance.x, width: 1.8 }] : []} />
        <Wall axis="z" at={left} from={corridorZ} to={corridorZ + s * sideLength} normal={[-1, 0]} />
        {room.last && <Wall axis="z" at={right} from={corridorZ} to={backZ} normal={[1, 0]} windows night={night} />}
        {night && <pointLight position={[room.x, 2.6, room.z]} intensity={Math.min(60, room.w * room.d * 0.28)} distance={Math.max(room.w, room.d) * 0.95} decay={1.6} color="#ffd29a" />}
        <Batched version={batchVersion(room, night)}>
          {room.kind === 'project' && <ProjectRoom room={room} activeKeys={activeKeys} night={night} />}
          {room.kind === 'cafe' && <Cafe room={room} night={night} />}
          {room.kind === 'lounge' && <Lounge room={room} night={night} />}
          {isLobby && <Lobby room={room} plan={plan} night={night} />}
        </Batched>
        <Suspense fallback={null}><RoomLabel room={room} agents={agentsByRoom.get(room.id) ?? []} now={now} onSelect={() => onSelectRoom(room.id)} /></Suspense>
      </group>;
    })}
    {/* The building's big neon sign out front, and a welcome mat. */}
    <group position={[plan.entrance.x + 3.4, 0, lobby.z + lobby.d / 2 + 1.6]}>
      {[-2.2, 2.2].map(x => <RBox key={x} size={[0.18, 3.1, 0.18]} round={0.3} position={[x, 1.55, -0.05]} color="#2b2d45" />)}
      <RBox size={[5.2, 1.5, 0.22]} round={0.08} position={[0, 2.5, -0.12]} color="#16142c" />
      <NeonSign text="tinyAGENTS" color="#ff4fd8" position={[0, 2.5, 0.01]} height={1.3} glow={1.3} />
    </group>
    <RBox size={[1.8, 0.03, 1.0]} round={0.2} position={[plan.entrance.x, 0.0, lobby.z + lobby.d / 2 + 0.75]} color="#ff9a4d" shadow={false} />
  </group>;
}
