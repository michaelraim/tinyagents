import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { BufferAttribute, Matrix4, Mesh, type BufferGeometry, type Group, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges every static mesh inside it into one mesh per material, so a room full of
 * desks, chairs and plants costs a handful of draw calls instead of hundreds.
 * Only wrap things that never move: the originals are hidden, not updated.
 * `version` must change whenever the children change.
 */
export function Batched({ children, version, shadows = true }: { children: ReactNode; version: string; shadows?: boolean }) {
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    const root = group.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const toLocal = new Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map<Material, { geometries: BufferGeometry[]; sources: Mesh[] }>();
    const visit = (o: Object3D) => {
      if (o.userData.noBatch) return;
      o.children.forEach(visit);
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.userData.batched || !mesh.visible || Array.isArray(mesh.material)) return;
      if ((mesh.material as Material).transparent || (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
      let geometry = mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld));
      if (geometry.index) geometry = geometry.toNonIndexed();
      // Merging needs identical attribute sets: keep position, normal and uv only.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const bucket = buckets.get(mesh.material as Material) ?? { geometries: [], sources: [] };
      bucket.geometries.push(geometry);
      bucket.sources.push(mesh);
      buckets.set(mesh.material as Material, bucket);
    };
    visit(root);
    const merged: Mesh[] = [];
    for (const [material, { geometries, sources }] of buckets) {
      if (geometries.length < 2) { geometries.forEach(g => g.dispose()); continue; }
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.userData.batched = true;
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      root.add(mesh);
      merged.push(mesh);
      for (const source of sources) source.visible = false;
    }
    return () => {
      for (const mesh of merged) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      root.traverse(o => { if ((o as Mesh).isMesh && !o.userData.batched) o.visible = true; });
    };
  }, [version]);
  return <group ref={group}>{children}</group>;
}

/** Children that move (spinning, bobbing, swimming) and must never be merged. */
export function NoBatch({ children }: { children: ReactNode }) {
  return <group userData={{ noBatch: true }}>{children}</group>;
}
