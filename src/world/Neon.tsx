import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, InstancedMesh, MathUtils, Object3D, RepeatWrapping, SRGBColorSpace, Vector3, type Mesh, type MeshStandardMaterial } from 'three';
import type { Building, Rect } from '../../shared/building';
import { box, mat } from './kit';
import { fx } from './fx';

/** Pixel fonts must be loaded before we draw it into canvases. */
const fontReady = typeof document !== 'undefined' && document.fonts
  ? Promise.all([document.fonts.load('700 64px "Silkscreen"'), document.fonts.load('400 64px "Tiny5"')]).catch(() => undefined)
  : Promise.resolve();
function useFontReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => { void fontReady.then(() => setReady(true)); }, []);
  return ready;
}

const cameraDir = new Vector3();

/**
 * A neon sign: glowing pixel lettering with an optional emoji, drawn to a canvas
 * and rendered unlit so bloom makes it glow. When `wallNormal` is given, the sign
 * hides while that wall is cut away for the camera.
 */
export function NeonSign({ text, icon, color, height = 0.5, position, rotation = 0, wallNormal, glow = 1 }: {
  text: string; icon?: string; color: string; height?: number; position: [number, number, number]; rotation?: number;
  wallNormal?: [number, number]; glow?: number;
}) {
  const ready = useFontReady();
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    const font = '700 86px "Silkscreen", monospace';
    g.font = font;
    const iconWidth = icon ? 120 : 0;
    const width = Math.ceil(g.measureText(text).width) + iconWidth + 80;
    canvas.width = width; canvas.height = 160;
    g.textBaseline = 'middle';
    // Outer glow, then a bright core: the classic neon tube look.
    for (const [blur, alpha, fill] of [[28, 0.9, color], [10, 1, color], [0, 1, '#ffffff']] as const) {
      g.shadowColor = color; g.shadowBlur = blur; g.globalAlpha = alpha;
      g.font = font; g.fillStyle = fill;
      g.fillText(text, 40 + iconWidth, 86);
    }
    if (icon) {
      g.shadowBlur = 18; g.globalAlpha = 1;
      g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.fillText(icon, 30, 88);
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return { texture: t, aspect: width / 160 };
  }, [text, icon, color, ready]);
  const mesh = useRef<Mesh>(null);
  useFrame(({ camera }, dt) => {
    if (!mesh.current) return;
    let target = 1;
    if (wallNormal) {
      camera.getWorldDirection(cameraDir);
      const facing = -(cameraDir.x * wallNormal[0] + cameraDir.z * wallNormal[1]);
      target = facing > 0.25 ? 0 : 1;
    }
    const s = MathUtils.damp(mesh.current.scale.y, target, 8, dt);
    mesh.current.scale.set(s, s, 1);
    mesh.current.visible = s > 0.02;
    // Neon flickers ever so slightly.
    (mesh.current.material as MeshStandardMaterial).opacity = 0.92 + Math.sin(performance.now() * 0.013 + position[0]) * 0.04 + (Math.random() < 0.002 ? -0.5 : 0);
  });
  return <mesh ref={mesh} position={position} rotation={[0, rotation, 0]}>
    <planeGeometry args={[height * aspect, height]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} color={new Color(2.6 * glow, 2.6 * glow, 2.6 * glow)} />
  </mesh>;
}

/** A thin glowing tube lying on the floor or along a wall. */
export function NeonStrip({ from, to, y = 0.03, color, thickness = 0.05, intensity = 2.2 }: { from: [number, number]; to: [number, number]; y?: number; color: string; thickness?: number; intensity?: number }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const material = useMemo(() => { const m = mat(color, { emissive: color, glow: intensity }).clone(); m.toneMapped = false; return m; }, [color, intensity]);
  useFrame(({ clock }) => {
    if (!fx.rainbow) { if (material.userData.rainbow) { material.color.set(color); material.emissive.set(color); material.userData.rainbow = false; } return; }
    material.userData.rainbow = true;
    const hue = (clock.elapsedTime * 0.08 + (from[0] + from[1]) * 0.02) % 1;
    material.color.setHSL(hue, 1, 0.6); material.emissive.setHSL(hue, 1, 0.55);
  });
  return <mesh geometry={box()} material={material} position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]} scale={[length, thickness, thickness]} />;
}

/** Glowing outline around a rectangle (a carpet's edge). */
export function NeonOutline({ rect, color, inset = 0.3, intensity = 2 }: { rect: Rect; color: string; inset?: number; intensity?: number }) {
  const l = rect.x - rect.w / 2 + inset, r = rect.x + rect.w / 2 - inset, t = rect.z - rect.d / 2 + inset, b = rect.z + rect.d / 2 - inset;
  return <group>
    <NeonStrip from={[l, t]} to={[r, t]} color={color} intensity={intensity} />
    <NeonStrip from={[r, t]} to={[r, b]} color={color} intensity={intensity} />
    <NeonStrip from={[r, b]} to={[l, b]} color={color} intensity={intensity} />
    <NeonStrip from={[l, b]} to={[l, t]} color={color} intensity={intensity} />
  </group>;
}

function windowTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  let h = seed;
  const rand = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
  const colors = ['#ffd27a', '#ffe3a8', '#9fe6ff', '#ff9ad8', '#fff1c9'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) {
    if (rand() > 0.55) continue;
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.fillRect(4 + x * 15, 3 + y * 8, 9, 5);
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * The city around the office: blocks of towers with lit windows, a street ring and
 * lamp posts. Windows glow at night; by day the towers are plain and sunlit.
 */
export function City({ plan, daylight }: { plan: Building; daylight: number }) {
  const { bounds } = plan;
  const towers = useMemo(() => {
    const list: { x: number; z: number; w: number; d: number; h: number; tone: number }[] = [];
    let s = 7;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const margin = 12;
    const minX = bounds.x - bounds.w / 2 - margin, maxX = bounds.x + bounds.w / 2 + margin;
    const minZ = bounds.z - bounds.d / 2 - margin, maxZ = bounds.z + bounds.d / 2 + margin;
    for (let x = minX - 60; x < maxX + 60; x += 9) for (let z = minZ - 60; z < maxZ + 60; z += 9) {
      if (x > minX - 6 && x < maxX && z > minZ - 6 && z < maxZ) continue;
      if (rand() < 0.25) continue;
      const dist = Math.min(Math.abs(x - bounds.x) - bounds.w / 2, Math.abs(z - bounds.z) - bounds.d / 2);
      // Keep the blocks between the camera and the office low-rise so they never hide it.
      const front = z > maxZ || x > maxX + 4;
      const h = front ? 1.2 + rand() * 2.2 : 3 + rand() * 9 + Math.max(0, dist) * 0.25;
      list.push({ x: x + rand() * 2, z: z + rand() * 2, w: 4 + rand() * 3.5, d: 4 + rand() * 3.5, h, tone: rand() });
    }
    return list;
  }, [bounds.x, bounds.z, bounds.w, bounds.d]);

  const body = useRef<InstancedMesh>(null);
  const lit = useRef<InstancedMesh>(null);
  const windows = useMemo(() => windowTexture(42), []);
  useEffect(() => {
    const o = new Object3D(), color = new Color();
    towers.forEach((t, i) => {
      o.position.set(t.x, t.h / 2 - 0.3, t.z); o.scale.set(t.w, t.h, t.d); o.updateMatrix();
      body.current?.setMatrixAt(i, o.matrix);
      body.current?.setColorAt(i, color.set(t.tone < 0.33 ? '#2a2850' : t.tone < 0.66 ? '#322e5a' : '#25304f'));
      o.scale.set(t.w + 0.02, t.h - 0.4, t.d + 0.02); o.updateMatrix();
      lit.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [body.current, lit.current]) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }, [towers]);
  const litMaterial = useRef<MeshStandardMaterial>(null);
  useFrame(() => { if (litMaterial.current) litMaterial.current.opacity = 1 - daylight * 0.85; });

  const lamps = useMemo(() => {
    const list: [number, number][] = [];
    const m = 4.5;
    const minX = bounds.x - bounds.w / 2 - m, maxX = bounds.x + bounds.w / 2 + m, minZ = bounds.z - bounds.d / 2 - m, maxZ = bounds.z + bounds.d / 2 + m;
    for (let x = minX; x <= maxX; x += 8) list.push([x, minZ], [x, maxZ]);
    for (let z = minZ + 8; z < maxZ; z += 8) list.push([minX, z], [maxX, z]);
    return list;
  }, [bounds.x, bounds.z, bounds.w, bounds.d]);
  const roadMargin = 6.5;
  return <group>
    {/* Asphalt, a pale sidewalk around the block, and road markings. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.x, -0.3, bounds.z]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color={new Color('#1d1b30').lerp(new Color('#4a4a5e'), daylight)} roughness={0.95} />
    </mesh>
    <mesh position={[bounds.x, -0.26, bounds.z]} scale={[bounds.w + 7, 0.08, bounds.d + 7]} geometry={box()} receiveShadow>
      <meshStandardMaterial color={new Color('#34314f').lerp(new Color('#8d8aa0'), daylight)} roughness={0.9} />
    </mesh>
    {[-1, 1].flatMap(s => [
      <mesh key={`h${s}`} position={[bounds.x, -0.28, bounds.z + s * (bounds.d / 2 + roadMargin)]} scale={[bounds.w + 30, 0.01, 0.12]} geometry={box()} material={mat('#ffd23f', { emissive: '#ffd23f', glow: 0.3 })} />,
      <mesh key={`v${s}`} position={[bounds.x + s * (bounds.w / 2 + roadMargin), -0.28, bounds.z]} scale={[0.12, 0.01, bounds.d + 30]} geometry={box()} material={mat('#ffd23f', { emissive: '#ffd23f', glow: 0.3 })} />,
    ])}
    <instancedMesh ref={body} args={[undefined, undefined, towers.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
    <instancedMesh ref={lit} args={[undefined, undefined, towers.length]}>
      <boxGeometry />
      <meshStandardMaterial ref={litMaterial} color="#000000" emissive="#ffffff" emissiveMap={windows} emissiveIntensity={1.4} transparent depthWrite={false} toneMapped={false} alphaMap={windows} />
    </instancedMesh>
    {lamps.map(([x, z], i) => <group key={i} position={[x, -0.26, z]}>
      <mesh geometry={box()} material={mat('#2b2d3a')} position={[0, 1.1, 0]} scale={[0.08, 2.2, 0.08]} />
      <mesh geometry={box()} position={[0, 2.25, 0]} scale={[0.3, 0.1, 0.3]}>
        <meshStandardMaterial color="#fff1c9" emissive="#ffc46b" emissiveIntensity={daylight > 0.5 ? 0.1 : 3} toneMapped={false} />
      </mesh>
    </group>)}
  </group>;
}
