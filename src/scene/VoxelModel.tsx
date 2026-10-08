import { memo, useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { buildVoxelModel } from '../../shared/voxel-models.mjs';

export const VoxelModel = memo(function VoxelModel({family,color='#b59ec9',variant=0,position=[0,0,0],rotation=[0,0,0],scale=1}: {family:string;color?:string;variant?:number;position?:[number,number,number];rotation?:[number,number,number];scale?:number}) {
  const geometry=useMemo(()=>{
    const data=buildVoxelModel(family,color,variant),g=new BufferGeometry();
    g.setAttribute('position',new BufferAttribute(data.positions,3));g.setAttribute('normal',new BufferAttribute(data.normals,3));g.setAttribute('color',new BufferAttribute(data.colors,3));g.setIndex(new BufferAttribute(data.indices,1));g.computeBoundingSphere();return g;
  },[family,color,variant]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow position={position} rotation={rotation} scale={scale}><meshStandardMaterial vertexColors roughness={.83}/></mesh>;
});
