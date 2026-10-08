import type { ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material } from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';

/**
 * Shared geometry and materials. Every mesh in the world reuses these instead of
 * allocating its own, so a big office costs a handful of GPU resources.
 */

const geometries = new Map<string, BufferGeometry>();
function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let geometry = geometries.get(key) as T | undefined;
  if (!geometry) { geometry = make(); geometries.set(key, geometry); }
  return geometry;
}

/** Unit rounded box; scale it per mesh. `round` is the corner radius relative to the smallest side. */
export const roundedBox = (round = 0.18) => cached(`rbox:${round}`, () => new RoundedBoxGeometry(1, 1, 1, 3, round));
export const box = () => cached('box', () => new BoxGeometry(1, 1, 1));
export const sphere = (detail = 20) => cached(`sphere:${detail}`, () => new SphereGeometry(0.5, detail, Math.round(detail * 0.75)));
export const cylinder = (top = 0.5, bottom = 0.5, segments = 20) => cached(`cyl:${top}:${bottom}:${segments}`, () => new CylinderGeometry(top, bottom, 1, segments));

const materials = new Map<string, MeshStandardMaterial>();
export function mat(color: string, options: { rough?: number; metal?: number; emissive?: string; glow?: number; opacity?: number } = {}): MeshStandardMaterial {
  const key = `${color}:${options.rough ?? 0.8}:${options.metal ?? 0}:${options.emissive ?? ''}:${options.glow ?? 0}:${options.opacity ?? 1}`;
  let material = materials.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color, roughness: options.rough ?? 0.8, metalness: options.metal ?? 0,
      emissive: options.emissive ?? '#000000', emissiveIntensity: options.glow ?? 0,
      transparent: (options.opacity ?? 1) < 1, opacity: options.opacity ?? 1,
      depthWrite: (options.opacity ?? 1) >= 1,
    });
    materials.set(key, material);
  }
  return material;
}

type V3 = [number, number, number];
type PartProps = { position?: V3; rotation?: V3; scale?: V3 | number; color: string; shadow?: boolean; material?: Material; children?: ReactNode; onClick?: () => void };

/** A rounded box with its size given directly. */
export function RBox({ size, round = 0.18, position, rotation, color, shadow = true, material }: Omit<PartProps, 'scale'> & { size: V3; round?: number }) {
  return <mesh geometry={roundedBox(round)} material={material ?? mat(color)} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />;
}
export function Block({ size, position, rotation, color, shadow = true, material }: Omit<PartProps, 'scale'> & { size: V3 }) {
  return <mesh geometry={box()} material={material ?? mat(color)} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />;
}
export function Ball({ size, position, rotation, color, shadow = true, material }: Omit<PartProps, 'scale'> & { size: V3 | number }) {
  const s: V3 = typeof size === 'number' ? [size, size, size] : size;
  return <mesh geometry={sphere()} material={material ?? mat(color)} position={position} rotation={rotation} scale={s} castShadow={shadow} receiveShadow />;
}
export function Cyl({ size, position, rotation, color, shadow = true, top = 0.5, bottom = 0.5, material }: Omit<PartProps, 'scale'> & { size: V3; top?: number; bottom?: number }) {
  return <mesh geometry={cylinder(top, bottom)} material={material ?? mat(color)} position={position} rotation={rotation} scale={size} castShadow={shadow} receiveShadow />;
}

/** Deterministic pseudo-random sequence from a string, for stable variety. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
