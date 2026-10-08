import { buildSpecialty } from './voxel-specialties.mjs';
// Original voxel kit. Models are voxelised, then greedy meshed by material.
// The browser and GLB exporter use exactly the same geometry generator.
const C={wood:'#bc885d',light:'#eee2bd',dark:'#384955',metal:'#839397',glass:'#8cc8cd',green:'#78a57c',pink:'#df929d',gold:'#dfb75d',paper:'#f7eed5',ink:'#31434b',red:'#cf7c68',blue:'#7f9fb8'};
const rgb=hex=>{const n=parseInt(hex.slice(1),16);return [n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});};
export const modelFamilies = new Set();
export function voxelsFor(family,accent='#a894d2',variant=0){
  const voxels=new Map(), a=accent, v=variant;
  const put=(x,y,z,c)=>voxels.set(`${x},${y},${z}`,c);
  const box=(x,y,z,w,h,d,c)=>{for(let i=0;i<w;i++)for(let j=0;j<h;j++)for(let k=0;k<d;k++)put(x+i,y+j,z+k,c);};
  const disc=(x,y,z,r,h,c)=>{for(let i=-r;i<=r;i++)for(let k=-r;k<=r;k++)if(i*i+k*k<=r*r)box(x+i,y,z+k,1,h,1,c);};
  const ball=(x,y,z,r,c)=>{for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++)for(let k=-r;k<=r;k++)if(i*i+j*j+k*k<=r*r)put(x+i,y+j,z+k,c);};
  const line=(p,q,c,r=1)=>{const n=Math.max(...p.map((a,i)=>Math.abs(q[i]-a)));for(let i=0;i<=n;i++)box(...p.map((a,j)=>Math.round(a+(q[j]-a)*i/(n||1))),r,r,r,c);};
  const legs=(w,d,h=10)=>{for(const x of [-w,w])for(const z of [-d,d])box(x,0,z,2,h,2,C.dark);};
  const table=(w=22,d=14,h=12)=>{legs(w/2-2,d/2-2,h);box(-w/2,h,-d/2,w,2,d,C.wood);};
  const screen=(x=0,y=8,z=0,w=16,h=12)=>{box(x-w/2,y,z,w,h,2,C.dark);box(x-w/2+1,y+1,z+2,w-2,h-2,1,C.glass);for(let i=0;i<3;i++)box(x-w/2+2,y+2+i*3,z+3,4+(i+v)%3*2,1,1,i%2?a:C.paper);};
  const wheels=(w=9,z=5)=>{for(const x of [-w,w])for(const side of [-z,z]){box(x-2,1,side,5,5,2,C.dark);box(x-1,2,side+(side>0?2:-1),3,3,1,C.metal);}};
  const books=(x=-8,y=0,z=-3,n=6)=>{for(let i=0;i<n;i++){const h=8+(i*3+v)%5;box(x+i*3,y,z,2,h,6,[a,C.red,C.green,C.gold][i%4]);box(x+i*3,y+h-2,z+6,2,1,1,C.paper);}};
  const leaf=(x,y,z)=>{ball(x,y,z,3,C.green);ball(x+2,y+3,z,3,'#96bc83');};
  if(buildSpecialty({box,disc,ball,line,table,legs,leaf,screen,C,a,v},family)){modelFamilies.add(family);return voxels;}
  switch(family){
    case 'register':box(-9,0,-6,18,5,12,a);box(-7,5,-3,14,3,7,C.dark);for(let i=0;i<12;i++)box(-6+i%4*3,8,-2+Math.floor(i/4)*2,2,1,1,C.paper);box(-1,8,-4,2,5,2,C.metal);screen(0,13,-4,12,6);break;
    case 'iv':disc(0,0,0,6,1,C.metal);box(0,1,0,1,28,1,C.metal);box(-5,27,0,11,1,1,C.metal);box(-5,18,0,4,8,2,C.glass);box(-4,20,2,2,4,1,C.paper);line([-3,18,0],[4,8,0],C.light);break;
    case 'controller':box(-9,2,-4,18,5,8,a);box(-10,0,-2,5,3,7,a);box(5,0,-2,5,3,7,a);box(-7,7,-1,5,1,1,C.dark);box(-5,7,-3,1,1,5,C.dark);for(const p of [[5,-2],[7,0],[5,2],[3,0]])box(p[0],7,p[1],1,1,1,C.gold);break;
    case 'cone':box(-5,0,-5,10,1,10,C.dark);for(let y=1;y<15;y++){const r=Math.max(1,5-Math.floor(y/3));box(-r,y,-r,r*2,1,r*2,y>7&&y<11?C.paper:C.red);}break;
    case 'barrier':box(-12,0,-3,24,4,6,C.metal);box(-12,4,-2,24,6,4,C.gold);for(let i=0;i<6;i++)box(-11+i*4,5,2,2,4,1,C.dark);break;
    case 'beam':box(-15,0,-3,30,2,6,C.metal);box(-15,2,-1,30,7,2,a);box(-15,9,-3,30,2,6,C.metal);break;
    case 'character-head':{
      const skins=['#e9b897','#be8762','#ecc5a2','#9d704f'],hair=['#46342e','#765137','#302e38','#ba884e'];
      box(-5,0,-4,10,9,8,skins[v%4]);box(-6,2,-1,12,3,2,skins[v%4]);box(-5,7,-4,10,3,8,hair[v%4]);box(-5,3,-4,10,5,2,hair[v%4]);box(-5,5,-3,2,3,5,hair[v%4]);box(3,6,-3,2,2,5,hair[v%4]);
      box(-3,3,4,1,2,1,C.ink);box(2,3,4,1,2,1,C.ink);box(-1,1,4,2,1,1,'#a16856');box(-4,2,4,1,1,1,C.pink);box(3,2,4,1,1,1,C.pink);
      if(v%3===1){box(-6,2,-2,2,5,4,a);box(4,2,-2,2,5,4,a);box(-5,10,-2,10,1,2,a);}
      if(v%3===2){box(-4,8,2,8,2,3,a);box(-3,10,-3,6,1,5,a);}
      if(v%4===0){box(-4,3,5,3,1,1,C.dark);box(1,3,5,3,1,1,C.dark);box(-1,4,5,2,1,1,C.dark);}
      break;
    }
    case 'character-body':box(-4,0,-3,8,8,6,a);box(-3,7,-2,6,2,4,a);box(-1,6,3,2,2,1,C.light);box(-2,1,3,4,2,1,a);box(2,5,3,1,1,1,C.gold);break;
    case 'character-arm':box(-1,-6,-1,3,6,3,a);box(-1,-8,-1,3,2,3,['#e9b897','#be8762','#ecc5a2','#9d704f'][v%4]);break;
    case 'character-leg':box(-1,-5,-1,3,6,3,C.dark);box(-2,-7,-2,4,2,5,C.paper);box(-2,-7,2,4,1,1,a);break;
    case 'terminal':case 'computer':case 'monitor': table();screen(0,16,-4);box(-1,14,-3,2,3,2,C.dark);box(-7,14,3,12,1,4,a);box(7,14,3,2,1,3,C.paper);if(v%2)screen(9,16,-3,10,10);break;
    case 'server':case 'transformer':box(-7,0,-5,14,27,10,C.dark);box(-6,1,5,12,25,1,a);for(let i=0;i<6;i++){box(-5,2+i*4,6,8,2,1,C.ink);box(4,2+i*4,6,1,1,1,i%2?C.green:C.gold);}box(-5,27,-3,10,1,6,C.metal);break;
    case 'router':case 'radio':box(-8,0,-4,16,6,8,a);box(-6,2,4,7,2,1,C.dark);for(let i=0;i<4;i++)box(3+i,2,4,1,1,1,C.green);box(-7,6,-3,1,8+v,1,C.dark);box(6,6,-3,1,6+v,1,C.dark);break;
    case 'chip':box(-8,0,-7,16,2,14,C.green);box(-4,2,-4,8,3,8,C.dark);for(let i=-6;i<=6;i+=3){box(i,1,-9,1,1,2,C.gold);box(i,1,7,1,1,2,C.gold);box(-10,1,i,2,1,1,C.gold);box(8,1,i,2,1,1,C.gold);}break;
    case 'phone':case 'tablet':case 'card':case 'cartridge':case 'calendar':case 'compact':case 'watch':box(-5,0,-2,10,16,3,a);box(-4,2,1,8,12,1,family==='cartridge'?C.paper:C.glass);box(-1,1,1,2,1,1,C.dark);box(-3,12,2,6,1,1,C.paper);box(-3,9,2,3+v,1,1,C.paper);break;
    case 'battery':case 'charger':case 'cell':box(-5,0,-4,10,17,8,a);box(-3,17,-2,6,2,4,C.dark);box(-3,2,4,6,12,1,C.ink);for(let i=0;i<3;i++)box(-2,3+i*4,5,4,2,1,C.green);if(family==='charger'){box(5,4,0,1,12,1,C.dark);box(6,3,0,3,2,1,C.dark);}break;
    case 'rocket':box(-3,3,-3,6,20,6,C.paper);box(-4,7,-4,8,10,8,C.paper);box(-3,21,-3,6,3,6,a);box(-2,24,-2,4,3,4,a);box(-1,27,-1,2,2,2,a);box(-2,13,4,4,4,1,C.glass);for(const x of [-7,4])box(x,1,-2,3,8,4,a);box(-2,0,-2,4,3,4,C.red);break;
    case 'satellite':box(-3,7,-3,6,8,6,C.gold);for(const x of [-19,7]){box(x,8,-7,12,1,14,C.blue);for(let i=1;i<12;i+=3)box(x+i,9,-7,1,1,14,C.glass);}box(-8,10,-1,16,1,2,C.metal);box(0,15,0,1,6,1,C.metal);ball(0,22,0,2,a);break;
    case 'dish':case 'telescope':case 'scanner':legs(5,4,8);box(-2,8,-2,4,6,4,C.metal);if(family==='telescope'){for(let i=0;i<16;i++)disc(i-8,13+Math.floor(i/3),0,3,2,a);box(-10,13,-2,2,5,5,C.dark);}else{for(let i=0;i<5;i++)disc(0,14+i,0,8-i,1,i?C.light:C.metal);box(0,19,0,1,5,1,C.dark);}break;
    case 'antenna':case 'pylon':box(-5,0,-5,10,2,10,C.metal);box(-1,2,-1,2,28,2,C.metal);for(let i=0;i<3;i++){box(-7+i,13+i*5,0,14-i*2,1,1,a);box(0,16+i*4,-5,1,1,11,a);}ball(0,30,0,2,C.red);break;
    case 'robot':box(-5,7,-3,10,10,6,a);box(-5,18,-4,10,8,8,C.light);box(-4,21,4,8,3,1,C.dark);box(-3,22,5,2,1,1,C.glass);box(2,22,5,2,1,1,C.glass);for(const x of [-7,5])box(x,9,-2,2,7,4,C.metal);for(const x of [-4,2]){box(x,2,-2,3,5,4,C.dark);box(x,0,-2,3,2,6,C.metal);}box(-1,26,0,2,2,2,C.red);break;
    case 'robotarm':disc(0,0,0,6,3,C.dark);box(-2,3,-2,4,9,4,a);line([0,12,0],[8,19,0],a,3);line([8,20,0],[14,14,0],C.metal,2);box(12,11,-3,2,4,6,C.dark);box(16,11,-3,2,4,6,C.dark);break;
    case 'drone':box(-4,5,-3,8,4,6,a);for(const x of [-10,10])for(const z of [-8,8]){line([0,7,0],[x,7,z],C.dark);box(x-5,9,z,11,1,1,C.metal);box(x,9,z-4,1,1,9,C.metal);box(x,2,z,1,5,1,C.dark);}ball(0,4,4,2,C.glass);break;
    case 'car':case 'truck':case 'bus':case 'rover':case 'tractor':case 'forklift':wheels();box(-12,5,-5,25,5,11,a);box(-9,10,-5,10,7,11,C.paper);box(-8,12,6,8,4,1,C.glass);box(-10,12,-5,1,4,10,C.glass);if(['truck','bus'].includes(family)){box(2,10,-5,11,10,11,a);box(3,18,6,9,1,1,C.paper);}if(family==='forklift'){box(12,3,-7,2,23,2,C.dark);box(12,3,6,2,23,2,C.dark);box(14,3,-7,10,1,2,C.metal);box(14,3,6,10,1,2,C.metal);}if(family==='rover')box(3,13,0,1,13,1,C.metal);break;
    case 'plane':box(-2,3,-14,4,4,29,C.paper);box(-16,4,-1,32,1,7,a);box(-7,6,-12,14,1,4,a);box(-1,7,-13,2,6,4,a);box(-2,5,8,4,2,5,C.glass);break;
    case 'ship':case 'submarine':box(-5,1,-12,10,4,25,a);box(-4,0,-10,8,1,21,C.dark);box(-3,5,-7,6,7,10,C.paper);box(-2,9,-6,4,2,9,C.glass);box(0,12,-3,1,9,1,C.metal);box(-5,17,-3,11,1,1,C.metal);if(family==='submarine'){box(-2,6,4,4,6,4,a);box(0,12,4,1,5,1,C.dark);}break;
    case 'train':box(-13,4,-5,26,7,10,a);box(-11,11,-5,10,7,10,C.paper);for(let i=0;i<5;i++)box(-10+i*5,12,5,3,4,1,C.glass);wheels();break;
    case 'house':case 'shop':case 'greenhouse':case 'modelhall':box(-10,0,-8,20,13,16,family==='greenhouse'?C.glass:C.paper);for(let i=0;i<7;i++)box(-11+i,13+i,-9,22-i*2,1,18,a);box(-2,0,8,4,8,1,C.wood);for(const x of [-8,4]){box(x,5,8,4,5,1,C.glass);box(x,7,9,4,1,1,C.paper);}if(family==='shop')box(-11,11,7,22,2,5,a);break;
    case 'tower':case 'factory':case 'city':case 'silo':box(-7,0,-6,14,26,12,a);for(let y=4;y<24;y+=5)for(let x=-5;x<6;x+=5)box(x,y,6,3,3,1,C.glass);box(-8,26,-7,16,2,14,C.light);if(family==='city')for(let i=0;i<3;i++)box(-16+i*11,0,10,8,9+i*4,7,[C.wood,C.blue,C.green][i]);break;
    case 'crane':box(-9,0,-5,18,2,10,C.dark);box(-1,2,-1,3,32,3,C.gold);box(-17,29,-2,38,3,5,a);for(let i=0;i<5;i++)box(-13+i*7,26,-1,1,3,3,C.gold);box(15,10,0,1,19,1,C.dark);box(14,8,0,3,2,1,C.metal);box(-6,22,-3,8,6,7,C.glass);break;
    case 'wind':box(-3,0,-3,6,2,6,C.metal);box(-1,2,-1,2,28,2,C.paper);ball(0,29,1,2,a);line([0,29,2],[0,43,2],C.paper,2);line([0,29,2],[-12,21,2],C.paper,2);line([0,29,2],[12,21,2],C.paper,2);break;
    case 'solar':case 'panel':case 'board':case 'frame':case 'sign':case 'xray':case 'chart':box(-13,9,-1,26,18,2,C.wood);box(-12,10,1,24,16,1,family==='solar'||family==='xray'?C.dark:C.paper);for(const x of [-10,9])box(x,0,-1,2,10,2,C.metal);if(family==='solar'){for(let x=-11;x<12;x+=5)for(let y=11;y<25;y+=4)box(x,y,2,4,3,1,C.blue);}else if(family==='chart'){for(let i=0;i<5;i++)box(-9+i*4,11,2,3,3+i*2,1,a);}else{for(let i=0;i<8;i++)box(-10+(i%4)*6,13+Math.floor(i/4)*7,2,4,4,1,[a,C.gold,C.green][i%3]);}break;
    case 'tree':case 'palm':case 'leaf':box(-1,0,-1,3,17,3,C.wood);for(let i=0;i<5;i++)ball(Math.round(Math.sin(i*2.4)*5),18+i%2*4,Math.round(Math.cos(i*2.4)*5),6,[a,a,'#accb8a'][i%3]);break;
    case 'plant':case 'flowers':case 'planter':case 'cactus':case 'terrarium':box(-5,0,-5,10,5,10,C.wood);box(-4,5,-4,8,1,8,C.dark);for(let i=0;i<3;i++){const x=-3+i*3;box(x,6,0,1,8+i*2,1,C.green);leaf(x,11+i,0);if(family==='flowers')ball(x,16+i,0,2,[a,C.gold,C.pink][i]);}break;
    case 'books':case 'shelf':case 'rack':case 'cabinet':case 'cage':box(-11,0,-4,2,25,9,C.wood);box(9,0,-4,2,25,9,C.wood);box(-11,0,-5,22,25,1,C.wood);for(let y=0;y<=24;y+=8){box(-11,y,-4,22,1,9,C.light);if(y<24){if(family==='books')books(-8,y+1,-2,5);else {box(-8,y+1,-2,6,5,5,a);box(1,y+1,-2,5+v,4,5,C.paper);}}}break;
    case 'book':case 'scroll':case 'card-stack':case 'newspaper':box(-8,0,-6,16,2,12,a);box(-7,2,-5,14,3,10,C.paper);box(-8,5,-6,16,1,12,a);box(-5,6,-2,10,1,1,C.gold);box(-4,6,0,8,1,1,C.gold);if(v%2)box(-6,6,-4,12,2,8,C.light);break;
    case 'keyboard':case 'piano':case 'mixer':case 'typewriter':box(-13,0,-5,26,4,10,a);for(let i=-11;i<12;i+=2){box(i,4,-1,1,1,5,C.paper);if(i%3)box(i,5,-2,1,1,3,C.dark);}if(family==='piano'){legs(10,4,12);box(-13,12,-5,26,4,10,a);box(-13,16,-5,26,11,2,C.dark);}if(family==='typewriter')box(-8,4,-5,16,10,2,C.paper);break;
    case 'speaker':case 'amp':case 'radio-large':box(-7,0,-5,14,22,10,a);box(-6,1,5,12,20,1,C.dark);ball(0,7,6,5,C.metal);ball(0,16,6,3,C.metal);ball(0,7,10,2,C.dark);break;
    case 'guitar':case 'sax':ball(0,6,0,6,a);ball(0,12,0,4,a);box(-1,13,0,2,17,2,C.wood);box(-2,29,0,4,5,2,C.wood);box(-1,3,6,2,23,1,C.light);box(-3,7,5,6,2,1,C.dark);break;
    case 'microphone':case 'headphones':case 'headset':case 'stethoscope':case 'ringlight':disc(0,0,0,6,2,C.dark);box(0,2,0,1,20,1,C.metal);if(family==='microphone'){box(-2,19,-2,5,8,5,C.dark);box(-2,22,-2,5,4,5,C.metal);}else{for(let i=0;i<24;i++){const t=i*Math.PI*2/24;box(Math.round(Math.cos(t)*7),22+Math.round(Math.sin(t)*7),0,2,2,2,a);}if(family==='headphones')for(const x of [-8,7])box(x,16,-2,3,6,5,C.dark);}break;
    case 'drums':disc(-6,4,0,5,6,a);disc(6,4,0,5,6,a);disc(0,0,6,6,9,C.dark);for(const x of [-10,10]){box(x,0,-5,1,16,1,C.metal);disc(x,16,-5,6,1,C.gold);}break;
    case 'turntable':case 'console':case 'calculator':case 'hotplate':box(-11,0,-7,22,4,14,a);disc(-3,4,0,6,1,C.dark);disc(-3,5,0,2,1,C.paper);box(7,4,-5,1,3,10,C.metal);for(let i=0;i<3;i++)box(8,4,2+i*2,2,1,1,C.red);break;
    case 'camera':case 'projector':box(-7,9,-4,14,9,8,a);disc(0,0,0,5,2,C.dark);box(-1,2,-1,2,7,2,C.metal);box(-3,10,4,6,6,5,C.dark);box(-2,11,9,4,4,1,C.glass);box(-4,18,-1,8,2,4,C.dark);break;
    case 'spotlight':case 'lamp':case 'tripod':disc(0,0,0,5,1,C.dark);box(0,1,0,1,23,1,C.metal);for(let i=0;i<5;i++)disc(0,21+i,0,7-i,1,i===0?C.light:a);break;
    case 'coffee':box(-8,0,-5,16,2,13,C.dark);box(-7,2,-5,14,15,8,a);box(-6,7,3,12,7,1,C.dark);box(-5,3,3,3,4,4,C.paper);box(2,3,3,3,4,4,C.paper);for(const x of [-4,3])box(x,8,4,1,3,2,C.metal);box(-6,17,-4,12,2,7,C.metal);break;
    case 'fridge':case 'oven':case 'atm':case 'booth':case 'printer3d':case 'cnc':box(-9,0,-7,18,27,14,a);box(-8,2,7,16,13,1,C.light);box(-8,16,7,16,10,1,C.dark);box(-6,18,8,12,6,1,C.glass);box(5,4,8,1,8,1,C.metal);if(family==='printer3d'){box(-6,4,8,12,10,1,C.dark);box(-2,4,9,4,5,1,C.gold);}break;
    case 'arcade':case 'pinball':case 'claw':box(-8,0,-6,16,12,12,a);box(-8,12,-6,16,16,7,a);box(-9,28,-6,18,4,12,C.pink);screen(0,16,1,14,10);box(-8,12,1,16,2,8,C.dark);box(-4,14,6,1,3,1,C.metal);ball(-4,18,6,2,C.red);box(3,14,6,2,1,2,C.gold);break;
    case 'table':case 'counter':case 'bench':case 'pingpong':table(family==='counter'?30:24,14);if(family==='counter')box(-14,0,-6,28,12,12,a);if(family==='bench')box(-12,13,-6,24,6,2,a);if(family==='pingpong'){box(-12,14,-7,24,1,14,C.green);box(0,15,-7,1,4,14,C.paper);}break;
    case 'chair':case 'sofa':case 'bed':case 'wheelchair':const w=family==='sofa'?24:family==='bed'?18:12;legs(w/2-2,5,6);box(-w/2,6,-6,w,4,14,a);box(-w/2,10,-6,w,10,3,a);if(family==='bed'){box(-9,6,5,18,4,12,a);box(-7,10,-3,14,2,5,C.paper);}else for(const x of [-w/2,w/2-2])box(x,10,-3,2,3,11,a);break;
    case 'flask':case 'bottle':case 'dropper':case 'perfume':case 'lipstick':case 'polish':case 'vase':case 'jar':case 'pills':for(let y=0;y<11;y++)disc(0,y,0,Math.max(2,6-Math.floor(y/3)),1,y<6?a:C.glass);disc(0,11,0,2,6,C.glass);disc(0,17,0,3,1,C.light);if(family==='pills'){box(-3,3,5,6,5,1,C.paper);box(-1,4,6,2,3,1,C.red);}break;
    case 'vials':case 'spools':box(-10,0,-4,20,2,8,C.wood);for(let i=0;i<5;i++){disc(-8+i*4,2,0,1,12,C.glass);disc(-8+i*4,3,0,1,4,a);disc(-8+i*4,14,0,1,2,[a,C.red,C.gold][i%3]);}break;
    case 'microscope':box(-6,0,-5,12,2,12,a);box(-5,2,-4,3,14,3,C.metal);box(-5,15,-4,12,3,3,a);box(4,11,-4,3,6,3,C.dark);box(-3,7,-2,10,1,8,C.dark);box(0,8,0,4,1,4,C.glass);box(3,17,-4,3,4,3,C.dark);break;
    case 'dna':case 'chain':case 'molecule':case 'orbits':case 'brain':if(family==='dna'){for(let i=0;i<12;i++){const x=Math.round(Math.sin(i*.6)*5),z=Math.round(Math.cos(i*.6)*5);ball(x,i*2,z,2,a);ball(-x,i*2,-z,2,C.gold);line([x,i*2,z],[-x,i*2,-z],C.light);}}else{for(let i=0;i<6;i++){const p=[Math.round(Math.sin(i*2.4)*8),5+i*3,Math.round(Math.cos(i*2.4)*6)];ball(...p,3,[a,C.red,C.gold][i%3]);if(i)line([0,12,0],p,C.metal);}ball(0,12,0,4,a);}break;
    case 'planet':case 'globe':case 'orb':disc(0,0,0,5,2,C.wood);box(-1,2,-1,2,5,2,C.metal);ball(0,15,0,9,family==='globe'?C.blue:a);if(family==='globe'){box(-4,17,8,6,4,1,C.green);box(3,10,8,3,6,1,C.green);}else for(let i=0;i<40;i++){const t=i*Math.PI/20;box(Math.round(Math.cos(t)*13),14+Math.round(Math.cos(t)*3),Math.round(Math.sin(t)*11),2,1,2,C.gold);}break;
    case 'vault':case 'lock':case 'chest':case 'toolbox':case 'container':box(-10,0,-7,20,17,14,a);box(-9,1,7,18,15,1,C.dark);box(-8,2,8,16,13,1,C.metal);disc(0,0,0,1,1,C.dark);box(-1,5,9,2,7,2,C.gold);box(-4,8,9,8,2,2,C.gold);if(family==='lock'){box(-6,17,-1,2,7,2,C.metal);box(4,17,-1,2,7,2,C.metal);box(-6,24,-1,12,2,2,C.metal);}break;
    case 'crate':case 'parcel':case 'gift':case 'blocks':case 'cube':box(-7,0,-6,14,12,12,a);box(-8,0,-7,16,2,14,C.wood);box(-8,10,-7,16,2,14,C.wood);box(-1,0,6,2,12,1,C.gold);box(-1,12,-6,2,1,12,C.gold);if(family==='gift'){box(-4,13,-1,4,2,2,C.pink);box(1,13,-1,4,2,2,C.pink);}break;
    case 'trophy':case 'medal':case 'bell':case 'gold':disc(0,0,0,6,2,C.dark);disc(0,2,0,3,4,C.gold);for(let y=6;y<14;y++)disc(0,y,0,Math.min(6,2+Math.floor((y-6)/2)),1,C.gold);box(-9,9,-1,3,6,2,C.gold);box(7,9,-1,3,6,2,C.gold);box(-9,15,-1,5,2,2,C.gold);box(5,15,-1,5,2,2,C.gold);break;
    case 'coins':disc(-4,0,0,5,3,C.gold);disc(-4,4,0,5,3,C.gold);disc(6,0,3,4,3,C.gold);disc(6,4,3,4,3,C.gold);disc(6,8,3,4,3,C.gold);break;
    case 'heart':case 'shield':case 'ghost':case 'duck':for(let y=0;y<12;y++){const r=family==='heart'?Math.min(y,5):5;box(-r,y,-2,r*2+1,1,4,a);}ball(-3,11,0,3,a);ball(3,11,0,3,a);if(family==='ghost'||family==='duck'){box(-3,7,3,2,2,1,C.dark);box(2,7,3,2,2,1,C.dark);if(family==='duck')box(-2,4,3,4,2,4,C.gold);}break;
    case 'dumbbell':case 'wheel':case 'tires':case 'gear':case 'reel':case 'ring':case 'coil':case 'compass':for(let i=0;i<40;i++){const t=i*Math.PI/20;box(Math.round(Math.cos(t)*8),10+Math.round(Math.sin(t)*8),0,2,2,4,a);}box(-7,9,0,16,2,2,C.metal);box(0,2,0,2,16,2,C.metal);break;
    case 'fountain':case 'plates':case 'bowl':case 'pan':case 'pot':case 'mug':case 'glass':case 'cake':case 'burger':case 'sushi':case 'bread':disc(0,0,0,8,2,C.light);for(let y=2;y<8;y++)disc(0,y,0,7,1,family==='burger'?[C.gold,C.green,C.red,C.wood][y%4]:y===7?C.paper:a);if(family==='fountain'){disc(0,2,0,7,1,C.glass);disc(0,3,0,2,8,C.light);disc(0,11,0,5,2,C.light);}if(family==='cake'){for(let i=-3;i<=3;i+=3)box(i,8,0,1,4,1,C.gold);}if(family==='mug')box(7,3,-2,3,4,4,a);break;
    case 'aqua':case 'aquarium':case 'dome':box(-11,0,-7,22,2,14,a);box(-11,2,-7,22,15,1,C.glass);box(-11,2,-7,1,15,14,C.glass);box(10,2,-7,1,15,14,C.glass);box(-11,17,-7,22,2,14,a);ball(1,8,1,3,C.gold);box(-5,7,1,3,3,1,C.gold);leaf(6,5,0);break;
    case 'rock':case 'mountain':case 'crystal':case 'shapes':for(let i=0;i<15;i++)box(-10+Math.floor(i*.65),i,-8+Math.floor(i*.5),Math.max(2,20-Math.floor(i*1.3)),1,Math.max(2,16-i),i>10?C.paper:a);break;
    case 'traffic':case 'beacon':case 'weather':case 'post':disc(0,0,0,5,2,C.dark);box(-1,2,-1,2,17,2,C.metal);box(-3,18,-2,6,12,4,C.dark);[C.green,C.gold,C.red].forEach((c,i)=>box(-1,19+i*4,2,3,2,1,c));break;
    case 'tent':case 'arch':for(let i=0;i<10;i++){box(-12+i,i*2,-8,2,2,16,a);box(10-i,i*2,-8,2,2,16,a);}break;
    case 'balloon':case 'umbrella':box(0,0,0,1,17,1,C.wood);if(family==='balloon')ball(0,24,0,8,a);else for(let i=0;i<5;i++)disc(0,17+i,0,12-i*2,1,i%2?a:C.paper);break;
    case 'helmet':case 'cap':case 'hat':for(let y=0;y<8;y++)disc(0,y,0,Math.max(3,8-Math.floor(y*.6)),1,a);box(-8,0,4,16,1,7,C.dark);break;
    case 'sword':case 'shovel':case 'ruler':case 'bat':case 'knives':box(-1,0,-1,2,20,2,C.wood);box(-4,20,-1,8,10,2,C.metal);box(-5,9,-2,10,2,4,a);break;
    case 'key':case 'gavel':case 'scissors':case 'drill':box(-1,0,-1,3,16,3,C.wood);box(-7,14,-3,14,6,6,a);box(3,8,-1,4,2,2,C.gold);break;
    case 'pencils':case 'brushes':disc(0,0,0,5,7,a);for(let i=0;i<7;i++){const x=Math.round(Math.sin(i*2.4)*3),z=Math.round(Math.cos(i*2.4)*3);box(x,7,z,1,10+i%3,1,[C.gold,C.pink,C.green][i%3]);box(x,17+i%3,z,1,2,1,C.dark);}break;
    case 'mannequin':case 'bust':case 'shirt':disc(0,0,0,5,2,C.dark);box(0,2,0,1,10,1,C.metal);box(-4,12,-3,8,11,6,a);box(-6,21,-2,12,3,4,a);box(-2,24,-2,4,4,4,C.light);if(family==='bust')box(-4,27,-3,8,8,6,C.light);break;
    case 'shoe':box(-4,0,-8,8,3,16,a);box(-4,3,-6,8,4,12,C.paper);box(-3,7,-6,6,4,7,a);for(let i=0;i<3;i++)box(-2,7,-i*2,4,1,1,C.dark);break;
    case 'suitcase':case 'bag':case 'medkit':box(-8,1,-4,16,16,8,a);box(-4,17,-2,2,3,3,C.dark);box(2,17,-2,2,3,3,C.dark);box(-4,20,-2,8,1,3,C.dark);box(-5,5,4,10,6,1,C.light);if(family==='medkit'){box(-1,5,5,2,7,1,C.red);box(-3,7,5,6,2,1,C.red);}break;
    case 'clock':case 'thermostat':case 'meter':box(-8,0,-2,16,16,4,a);box(-7,1,2,14,14,1,C.paper);box(0,7,3,1,6,1,C.dark);box(0,7,3,5,1,1,C.dark);break;
    case 'cart':case 'conveyor':case 'treadmill':legs(9,5,4);box(-12,4,-6,24,3,12,a);box(-10,7,-5,20,1,10,C.dark);for(let i=0;i<6;i++)box(-8+i*3,8,-5,1,1,10,C.metal);box(10,7,-6,2,12,2,C.dark);box(10,7,4,2,12,2,C.dark);box(10,19,-6,2,2,12,C.dark);break;
    case 'chess':case 'dice':case 'abacus':case 'palette':case 'clapper':case 'clapperboard':box(-8,0,-6,16,2,12,C.wood);for(let i=0;i<16;i++)box(-8+(i%4)*4,2,-6+Math.floor(i/4)*3,4,1,3,i%2?a:C.paper);if(family==='chess')for(let i=0;i<4;i++)disc(-6+i*4,3,-4,1,3,C.dark);if(family==='dice')box(-5,3,-4,10,8,8,a);break;
    case 'solar-small':box(-8,0,-6,16,1,12,C.blue);break;
    // Smaller specialist models are assembled from parts, with family-specific silhouettes.
    case 'pump':case 'cooler':case 'tank':case 'capsule':case 'centrifuge':case 'blender':case 'diffuser':case 'burner':case 'watering':disc(0,0,0,6,2,C.dark);disc(0,2,0,5,16,a);disc(0,18,0,4,2,C.light);box(-2,9,5,4,5,1,C.glass);if(family==='watering'||family==='pump')line([5,8,0],[12,14,0],C.metal,2);break;
    case 'motor':case 'lathe':case 'laser':case 'tube':case 'cannon':table(22,12,5);box(-8,7,-4,17,8,8,a);box(9,9,-2,5,4,4,C.dark);box(-7,15,-2,3,4,4,C.metal);break;
    case 'scales':case 'cradle':case 'pendulum':disc(0,0,0,6,2,C.wood);box(0,2,0,1,19,1,C.gold);box(-10,19,0,21,1,1,C.gold);for(const x of [-9,9]){box(x,10,0,1,9,1,C.dark);disc(x,8,0,4,1,a);}break;
    case 'easel':case 'mirror':case 'cattree':box(-9,0,-1,2,25,2,C.wood);box(7,0,-1,2,25,2,C.wood);box(-10,8,-2,20,17,2,C.wood);box(-8,10,0,16,13,1,family==='mirror'?C.glass:C.paper);if(family==='easel'){ball(0,16,1,4,a);box(-8,7,0,16,1,4,C.wood);}break;
    case 'hive':case 'corn':case 'wheat':case 'coral':case 'fish':case 'shell':case 'comet':case 'wave':case 'bone':case 'anchor':for(let i=0;i<5;i++){const x=-8+i*4;box(x,0,0,2,9+i%3*3,2,C.wood);ball(x,8+i%3*3,0,3,i%2?a:C.gold);}break;
    case 'football':case 'kettlebell':case 'cushion':case 'punchbag':case 'podium':case 'carpet':case 'pad':case 'stadium':case 'goal':case 'hoop':case 'racket':case 'whistle':case 'bike':case 'scooter':if(family==='bike'||family==='scooter'){for(const x of [-9,9]){for(let i=0;i<20;i++){const t=i*Math.PI/10;box(x+Math.round(Math.cos(t)*5),6+Math.round(Math.sin(t)*5),0,1,1,2,C.dark);}}line([-9,6,0],[0,15,0],a,2);line([0,15,0],[9,6,0],a,2);line([-9,6,0],[9,6,0],a,2);}else if(['goal','hoop'].includes(family)){box(-9,0,0,2,22,2,C.paper);box(8,0,0,2,22,2,C.paper);box(-9,22,0,19,2,2,C.paper);}else{disc(0,0,0,8,3,a);ball(0,8,0,6,C.light);box(-1,2,6,2,12,1,a);}break;
    case 'sewing':case 'iron':case 'dryer':case 'printer':case 'stamp':box(-9,0,-5,18,3,10,C.dark);box(-9,3,-5,5,12,10,a);box(-9,15,-5,18,4,10,a);box(6,9,-2,2,7,3,C.metal);box(-2,3,-3,8,1,7,C.paper);break;
    case 'rolls':for(const x of [-5,5])disc(x,0,0,4,13,a);disc(0,13,0,4,5,C.paper);break;
    case 'ball':case 'cap-small':ball(0,7,0,7,a);break;
    case 'chat':box(-8,3,-2,16,11,4,a);box(2,0,-2,3,3,4,a);for(let i=-4;i<6;i+=4)box(i,7,2,2,2,1,C.paper);break;
    case 'mailbox':case 'bin':box(-6,0,-5,12,15,10,a);box(-7,15,-6,14,2,12,C.dark);box(-4,11,5,8,2,1,C.dark);break;
    case 'megaphone':disc(0,0,0,4,5,C.dark);box(-1,5,-1,2,7,2,C.dark);for(let i=0;i<8;i++)disc(0,12+i,0,3+Math.floor(i/2),1,a);break;
    case 'vacuum':disc(0,0,0,9,4,a);disc(0,4,0,7,1,C.dark);disc(0,5,0,2,2,C.glass);break;
    case 'plug':box(-4,0,-3,8,8,6,a);box(-3,8,-1,2,5,2,C.metal);box(1,8,-1,2,5,2,C.metal);break;
    case 'buoy':disc(0,0,0,7,3,C.red);disc(0,3,0,3,10,C.paper);box(0,13,0,1,7,1,C.metal);break;
    case 'spool':disc(0,0,0,5,2,C.wood);disc(0,2,0,3,7,a);disc(0,9,0,5,2,C.wood);break;
    default: throw new Error(`Unmodelled voxel family: ${family}`);
  }
  modelFamilies.add(family);
  return voxels;
}

// Greedy rectangles on exposed voxel faces reduce each model to a few hundred quads.
export function meshVoxels(voxels, unit=.08){
  const positions=[], normals=[], colors=[], indices=[], planes=new Map();
  const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(const [key,c] of voxels){const p=key.split(',').map(Number);dirs.forEach((n,d)=>{const q=p.map((v,i)=>v+n[i]);if(voxels.has(q.join(',')))return;const axis=Math.floor(d/2),u=(axis+1)%3,w=(axis+2)%3,slice=p[axis]+(d%2===0?1:0),pk=`${d}|${slice}|${c}`;if(!planes.has(pk))planes.set(pk,new Map());planes.get(pk).set(`${p[u]},${p[w]}`,true);});}
  for(const [key,plane] of planes){const [ds,ss,c]=key.split('|'),d=+ds,s=+ss,axis=Math.floor(d/2),u=(axis+1)%3,w=(axis+2)%3,n=dirs[d],color=rgb(c);while(plane.size){const [x,y]=plane.keys().next().value.split(',').map(Number);let width=1,height=1;while(plane.has(`${x+width},${y}`))width++;outer:while(true){for(let i=0;i<width;i++)if(!plane.has(`${x+i},${y+height}`))break outer;height++;}for(let i=0;i<width;i++)for(let j=0;j<height;j++)plane.delete(`${x+i},${y+j}`);const base=positions.length/3;const corners=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];if(d%2)corners.reverse();for(const [a,b]of corners){const p=[0,0,0];p[axis]=s;p[u]=a;p[w]=b;positions.push(...p.map(v=>v*unit));normals.push(...n);colors.push(...color);}indices.push(base,base+1,base+2,base,base+2,base+3);}}
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),colors:new Float32Array(colors),indices:new Uint32Array(indices)};
}
export function buildVoxelModel(family,color,variant=0){return meshVoxels(voxelsFor(family,color,variant));}
