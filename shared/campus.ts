import type { Point, Rect } from './layout';

export type Plot = Rect & { id: string; group: string };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function footprint(rects: Rect[]): Rect {
  const left = Math.min(...rects.map(r => r.x-r.w/2)), right = Math.max(...rects.map(r => r.x+r.w/2));
  const back = Math.min(...rects.map(r => r.z-r.d/2)), front = Math.max(...rects.map(r => r.z+r.d/2));
  return { x:(left+right)/2, z:(back+front)/2, w:right-left, d:front-back };
}

// Edge candidates are generated from the existing footprint, never from room slots.
// Dimensions and coordinates share a two-unit grid so circulation can be carved
// exactly out of the remaining land without overlapping any room floor.
export function packPlots(specs: Omit<Plot,'x'|'z'>[]): Plot[] {
  const placed: Plot[] = [];
  for (const spec of specs) {
    if (!placed.length) { placed.push({...spec,x:0,z:0}); continue; }
    const candidates: Point[] = [];
    for (const anchor of placed) {
      for (const direction of [-1,1]) {
        for (const alignment of [-1,1]) {
          candidates.push({x:anchor.x+direction*((anchor.w+spec.w)/2+4),z:anchor.z+alignment*(anchor.d-spec.d)/2});
          candidates.push({x:anchor.x+alignment*(anchor.w-spec.w)/2,z:anchor.z+direction*((anchor.d+spec.d)/2+4)});
        }
      }
    }
    const siblings = placed.filter(p=>p.group===spec.group);
    let best: Point | undefined, score = Infinity;
    for (const candidate of candidates) {
      if (placed.some(p=>Math.abs(p.x-candidate.x)<(p.w+spec.w)/2+3.99 && Math.abs(p.z-candidate.z)<(p.d+spec.d)/2+3.99)) continue;
      const bounds = footprint([...placed,{...spec,...candidate}]);
      const proximity = siblings.length ? Math.min(...siblings.map(p=>distance(p,candidate))) : distance(candidate,placed[0]);
      const cost = bounds.w*bounds.d + Math.abs(bounds.w-bounds.d)*12 + proximity*14;
      if (cost<score) {best=candidate;score=cost;}
    }
    if (!best) throw new Error('No available plot on the campus frontier');
    placed.push({...spec,...best});
  }
  return placed;
}

export function connectPlots(plots: Rect[], entrances: Point[], hub: Rect): Rect[] {
  const bounds=footprint(plots), margin=6, cells=new Set<string>();
  const key=(x:number,z:number)=>`${x},${z}`;
  const cell=(p:Point)=>({x:Math.floor(p.x/2),z:Math.floor(p.z/2)});
  const center=(p:Point)=>({x:p.x*2+1,z:p.z*2+1});
  const clear=(x:number,z:number)=>!plots.some(r=>Math.abs(x*2+1-r.x)<r.w/2 && Math.abs(z*2+1-r.z)<r.d/2);
  const goal=cell({x:hub.x+1,z:hub.z+hub.d/2+1});
  const minX=Math.floor((bounds.x-bounds.w/2-margin)/2),maxX=Math.ceil((bounds.x+bounds.w/2+margin)/2);
  const minZ=Math.floor((bounds.z-bounds.d/2-margin)/2),maxZ=Math.ceil((bounds.z+bounds.d/2+margin)/2);
  for(const entrance of entrances) {
    const start=cell(entrance), queue=[start], parents=new Map<string,Point|null>([[key(start.x,start.z),null]]);
    let found:Point|undefined;
    for(let i=0;i<queue.length;i++) {
      const p=queue[i];
      if(p.x===goal.x&&p.z===goal.z){found=p;break;}
      const neighbors=[{x:p.x+1,z:p.z},{x:p.x-1,z:p.z},{x:p.x,z:p.z+1},{x:p.x,z:p.z-1}].sort((a,b)=>distance(a,goal)-distance(b,goal));
      for(const n of neighbors){const id=key(n.x,n.z);if(n.x<minX||n.x>maxX||n.z<minZ||n.z>maxZ||parents.has(id)||!clear(n.x,n.z))continue;parents.set(id,p);queue.push(n);}
    }
    if(!found)throw new Error('A campus entrance could not reach the hub');
    let p:Point|null=found;
    while(p){for(const [dx,dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])if(clear(p.x+dx,p.z+dz))cells.add(key(p.x+dx,p.z+dz));p=parents.get(key(p.x,p.z))??null;}
  }
  // Merge tiles into disjoint rectangles; rendering and navigation share these.
  const rows=new Map<number,number[]>();
  for(const id of cells){const [x,z]=id.split(',').map(Number);rows.set(z,[...(rows.get(z)??[]),x]);}
  const rectangles:Rect[]=[];
  for(const [z,xs] of [...rows].sort((a,b)=>a[0]-b[0])) {
    xs.sort((a,b)=>a-b);
    for(let i=0;i<xs.length;){let end=i;while(end+1<xs.length&&xs[end+1]===xs[end]+1)end++;
      const left=center({x:xs[i],z}).x-1,w=(end-i+1)*2,front=center({x:0,z}).z+1;
      const prior=rectangles.find(r=>r.x===left+w/2&&r.w===w&&Math.abs(r.z+r.d/2-(front-2))<.01);
      if(prior){prior.z+=1;prior.d+=2;}else rectangles.push({x:left+w/2,z:front-1,w,d:2});i=end+1;
    }
  }
  return rectangles;
}
