import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, Vector3, type Material, type MeshStandardMaterial, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Kenney CC0 assets (public/assets/kenney). Kenney models are authored at roughly
 * 0.57× our world scale with corner pivots; everything here is normalised so a model
 * stands on y = 0, centred on its footprint, at world scale.
 */
export const KENNEY_SCALE = 1.75;
const FURNITURE = '/assets/kenney/furniture/';
const CHARACTERS = '/assets/kenney/characters/';

export const characterVariants = [
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
] as const;
export type CharacterVariant = typeof characterVariants[number];

export type FurnitureName =
  | 'desk' | 'deskCorner' | 'chairDesk' | 'computerScreen' | 'computerKeyboard' | 'computerMouse' | 'laptop'
  | 'loungeSofa' | 'loungeSofaLong' | 'loungeSofaCorner' | 'loungeSofaOttoman' | 'loungeChair' | 'loungeChairRelax' | 'loungeDesignChair' | 'loungeDesignSofa'
  | 'pottedPlant' | 'plantSmall1' | 'plantSmall2' | 'plantSmall3'
  | 'bookcaseOpen' | 'bookcaseOpenLow' | 'bookcaseClosedWide' | 'books'
  | 'kitchenCoffeeMachine' | 'kitchenFridge' | 'kitchenFridgeLarge' | 'kitchenCabinet' | 'kitchenCabinetDrawer' | 'kitchenCabinetUpper' | 'kitchenSink' | 'kitchenMicrowave' | 'kitchenBar' | 'kitchenBarEnd' | 'toaster' | 'kitchenBlender'
  | 'stoolBar' | 'stoolBarSquare' | 'tableRound' | 'tableCoffee' | 'tableCoffeeGlass' | 'table' | 'sideTable' | 'chair' | 'chairRounded' | 'chairModernCushion'
  | 'lampRoundFloor' | 'lampSquareFloor' | 'lampRoundTable' | 'lampSquareTable' | 'lampWall'
  | 'rugRounded' | 'rugRectangle' | 'rugRound' | 'rugSquare' | 'rugDoormat'
  | 'televisionModern' | 'cabinetTelevision' | 'speaker' | 'speakerSmall' | 'radio'
  | 'trashcan' | 'cardboardBoxClosed' | 'cardboardBoxOpen' | 'coatRackStanding' | 'bear' | 'pillow' | 'pillowBlue' | 'bench' | 'benchCushion' | 'ceilingFan';

type Prepared = { scene: Object3D; size: Vector3 };
const prepared = new Map<string, Prepared>();

function prepare(scene: Object3D, key: string): Prepared {
  let entry = prepared.get(key);
  if (entry) return entry;
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const center = box.getCenter(new Vector3());
  const root = new Group();
  const inner = scene.clone(true);
  inner.position.set(-center.x, -box.min.y, -center.z);
  root.add(inner);
  root.scale.setScalar(KENNEY_SCALE);
  root.traverse(o => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = (o as Mesh).material as MeshStandardMaterial;
      if (m && 'roughness' in m) { m.roughness = Math.max(m.roughness, 0.55); m.metalness = Math.min(m.metalness, 0.2); }
    }
  });
  entry = { scene: root, size: box.getSize(new Vector3()).multiplyScalar(KENNEY_SCALE) };
  prepared.set(key, entry);
  return entry;
}

type V3 = [number, number, number];
/**
 * A Kenney furniture piece. `rotation` is the yaw; Kenney models face +z.
 * `tint` recolours every material (cloned, so other copies keep their colour).
 */
export function Kit({ name, position = [0, 0, 0], rotation = 0, scale = 1, tint }: { name: FurnitureName; position?: V3; rotation?: number; scale?: number | V3; tint?: string }) {
  const { scene } = useGLTF(FURNITURE + name + '.glb');
  const object = useMemo(() => {
    const copy = prepare(scene, name).scene.clone(true);
    if (tint) copy.traverse(o => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(m => tinted(m, tint))
        : tinted(mesh.material, tint);
    });
    return copy;
  }, [scene, name, tint]);
  // The prepared root carries the world scale; transform a wrapper so it isn't overwritten.
  return <group position={position} rotation={[0, rotation, 0]} scale={typeof scale === 'number' ? [scale, scale, scale] : scale}>
    <primitive object={object} />
  </group>;
}

const tintCache = new Map<string, Material>();
function tinted(material: Material, tint: string) {
  const key = `${material.uuid}:${tint}`;
  let m = tintCache.get(key);
  if (!m) { m = material.clone(); (m as MeshStandardMaterial).color?.set(tint); tintCache.set(key, m); }
  return m;
}

/** A skinned character clone with its own skeleton, plus the shared animation clips. */
export function useCharacter(variant: CharacterVariant) {
  const gltf = useGLTF(CHARACTERS + 'character-' + variant + '.glb');
  return useMemo(() => {
    const scene = cloneSkinned(gltf.scene);
    scene.traverse(o => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    return { scene, animations: gltf.animations };
  }, [gltf]);
}

export function preloadAssets() {
  for (const v of characterVariants) useGLTF.preload(CHARACTERS + 'character-' + v + '.glb');
  for (const name of ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'laptop', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'loungeSofa', 'bookcaseOpen', 'kitchenCoffeeMachine'] as FurnitureName[]) useGLTF.preload(FURNITURE + name + '.glb');
}
