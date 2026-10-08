import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync,strToU8 } from 'fflate';
import { verticals } from '../shared/verticals.mjs';
import { buildVoxelModel } from '../shared/voxel-models.mjs';

function glb(model,prop){
  const arrays=[model.positions,model.normals,model.colors,model.indices],bin=Buffer.concat(arrays.map(a=>Buffer.from(a.buffer)));
  let offset=0;const views=arrays.map(a=>{const v={buffer:0,byteOffset:offset,byteLength:a.byteLength};offset+=a.byteLength;return v;});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<model.positions.length;i++){min[i%3]=Math.min(min[i%3],model.positions[i]);max[i%3]=Math.max(max[i%3],model.positions[i]);}
  const json={asset:{version:'2.0',generator:'tinyAGENTS voxel kit'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:prop.name}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,material:0}]}],materials:[{pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.83}}],buffers:[{byteLength:bin.length}],bufferViews:views,accessors:arrays.map((a,i)=>({bufferView:i,componentType:i===3?5125:5126,count:i===3?a.length:a.length/3,type:i===3?'SCALAR':'VEC3',...(i===0?{min,max}:{})})),extras:prop};
  const raw=JSON.stringify(json),jsonBytes=Buffer.from(raw+' '.repeat((4-Buffer.byteLength(raw)%4)%4));
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonBytes.length+bin.length,8);header.writeUInt32LE(jsonBytes.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jsonBytes,binHeader,bin]);
}
function thumbnail(m){
  const faces=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<m.positions.length;i+=12){const n=m.normals.slice(i,i+3);if(n[0]+n[2]+n[1]*1.4<=0)continue;const pts=[];let depth=0;for(let j=0;j<4;j++){const [x,y,z]=m.positions.slice(i+j*3,i+j*3+3),px=(x-z)*.866,py=(x+z)*.5-y;pts.push([px,py]);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);depth+=x+z+y*.08;}
    const shade=n[1]>.5?1.09:n[0]>.5?.85:.72;const c=Array.from(m.colors.slice(i,i+3)).map(v=>Math.min(255,Math.round((v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055)*255*shade)));faces.push({pts,depth,color:`rgb(${c.join(',')})`});}
  const scale=144/Math.max(maxX-minX,maxY-minY),ox=96-(minX+maxX)/2*scale,oy=92-(minY+maxY)/2*scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><ellipse cx="96" cy="166" rx="53" ry="12" fill="#40594d" opacity=".1"/>${faces.sort((a,b)=>a.depth-b.depth).map(f=>`<polygon points="${f.pts.map(([x,y])=>`${(x*scale+ox).toFixed(2)},${(y*scale+oy).toFixed(2)}`).join(' ')}" fill="${f.color}" stroke="${f.color}" stroke-width=".3"/>`).join('')}</svg>`;
}
await mkdir('public/models',{recursive:true});await mkdir('public/model-previews',{recursive:true});await mkdir('public/packs',{recursive:true});
let count=0,triangles=0,bytes=0;const report=[],fullPack={};
for(const vertical of verticals){const pack={};for(const prop of vertical.props){const model=buildVoxelModel(prop.family,prop.color,prop.variant);if(!model.indices.length||!Array.from(model.positions).every(Number.isFinite))throw new Error(`Invalid model ${prop.id}`);const file=glb(model,prop);triangles+=model.indices.length/3;bytes+=file.length;pack[`${prop.id}.glb`]=file;await Promise.all([writeFile(join('public/models',`${prop.id}.glb`),file),writeFile(join('public/model-previews',`${prop.id}.svg`),thumbnail(model))]);count++;}
  pack['catalog.json']=strToU8(JSON.stringify(vertical,null,2));for(const [name,data]of Object.entries(pack))fullPack[`${vertical.id}/${name}`]=data;await writeFile(join('public/packs',`${vertical.id}.zip`),zipSync(pack));report.push({id:vertical.id,name:vertical.name,models:vertical.props.length});}
await writeFile('public/packs/tinyagents-voxel-kit.zip',zipSync(fullPack));
// Preserve old download links while serving the newly branded contents.
await writeFile('public/packs/sidequest-voxel-kit.zip',zipSync(fullPack));
await writeFile('public/models/catalog.json',JSON.stringify({version:1,style:'original-voxel',verticals},null,2));
console.log(JSON.stringify({verticals:verticals.length,models:count,families:new Set(verticals.flatMap(v=>v.props.map(p=>p.family))).size,triangles,megabytes:(bytes/1e6).toFixed(2),report},null,2));
