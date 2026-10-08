import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { verticals,allProps } from '../shared/verticals.mjs';
import { buildVoxelModel,meshVoxels,voxelsFor } from '../shared/voxel-models.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('voxel asset kit',()=>{
  it('provides fifty complete verticals with stable, unique asset identities',()=>{
    expect(verticals).toHaveLength(50);expect(allProps).toHaveLength(1000);
    expect(new Set(allProps.map(p=>p.id)).size).toBe(1000);
    for(const v of verticals){expect(v.props).toHaveLength(20);expect(new Set(v.props.map(p=>p.name)).size).toBe(20);}
  });
  it('removes internal faces and merges a solid block into six quads',()=>{
    const block=new Map<string,string>();for(let x=0;x<3;x++)for(let y=0;y<2;y++)for(let z=0;z<4;z++)block.set(`${x},${y},${z}`,'#ffffff');
    const mesh=meshVoxels(block,1);expect(mesh.positions.length/3).toBe(24);expect(mesh.indices.length/3).toBe(12);
  });
  it('builds every recipe with finite bounds, valid indices and outward triangle winding',()=>{
    for(const prop of allProps){const mesh=buildVoxelModel(prop.family,prop.color,prop.variant);expect(mesh.indices.length,prop.id).toBeGreaterThan(0);expect([...mesh.positions].every(Number.isFinite),prop.id).toBe(true);
      for(let i=0;i<mesh.indices.length;i+=3){const ids=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]];expect(Math.max(...ids)).toBeLessThan(mesh.positions.length/3);const p=ids.map(id=>mesh.positions.slice(id*3,id*3+3)),u=p[1].map((v,j)=>v-p[0][j]),v=p[2].map((v,j)=>v-p[0][j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],n=mesh.normals.slice(ids[0]*3,ids[0]*3+3);expect(cross.reduce((sum,v,j)=>sum+v*n[j],0),`${prop.id} face ${i}`).toBeGreaterThan(0);}
    }
  },20000);
  it('gives specialist objects distinct silhouettes with the same palette',()=>{
    const families=['fish','corn','hive','sushi','cake','mug','pan','lipstick','perfume','helmet','tube','motor','dice','abacus','calculator'];
    const shapes=families.map(f=>JSON.stringify([...voxelsFor(f,'#aabbcc',0)].map(([k])=>k).sort()));
    expect(new Set(shapes).size).toBe(families.length);
  });
  it('exports all recipes as valid GLB containers with matching identities',()=>{
    for(const prop of allProps){const file=readFileSync(`public/models/${prop.id}.glb`);expect(file.readUInt32LE(0)).toBe(0x46546c67);expect(file.readUInt32LE(4)).toBe(2);expect(file.readUInt32LE(8)).toBe(file.length);const length=file.readUInt32LE(12),json=JSON.parse(file.subarray(20,20+length).toString());expect(json.extras.id).toBe(prop.id);expect(json.accessors[0].min.every(Number.isFinite)).toBe(true);expect(json.buffers[0].byteLength).toBe(file.length-length-28);}
  });
  it('loads a representative GLB from every vertical with the actual Three.js loader',async()=>{
    const loader=new GLTFLoader();for(const v of verticals){const data=readFileSync(`public/models/${v.props[0].id}.glb`),buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);const asset=await loader.parseAsync(buffer,'');expect(asset.scene.children).toHaveLength(1);expect(asset.scene.children[0].name).toBeTruthy();}
  });
});
