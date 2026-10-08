export type Point = { x: number; z: number };
type Rect = Point & { w: number; d: number };

export const BODY_RADIUS = .38;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const diagonal=BODY_RADIUS/Math.SQRT2;
const clearanceSamples=[[0,0],[BODY_RADIUS,0],[-BODY_RADIUS,0],[0,BODY_RADIUS],[0,-BODY_RADIUS],[diagonal,diagonal],[-diagonal,diagonal],[diagonal,-diagonal],[-diagonal,-diagonal]];

/** Configuration-space routing: walls, desks and floor edges include body clearance. */
export class Navigation {
  readonly cell = .45;
  readonly width: number;
  readonly depth: number;
  readonly origin: Point;
  readonly open: Uint8Array;
  constructor(readonly plan: { bounds: Rect; floors: Rect[]; obstacles: Rect[] }) {
    this.origin = { x: plan.bounds.x - plan.bounds.w / 2, z: plan.bounds.z - plan.bounds.d / 2 };
    this.width = Math.ceil(plan.bounds.w / this.cell) + 1;
    this.depth = Math.ceil(plan.bounds.d / this.cell) + 1;
    this.open = new Uint8Array(this.width * this.depth);
    for (let i = 0; i < this.open.length; i++) this.open[i] = Number(this.clear(this.point(i)));
  }
  clear(p: Point): boolean {
    for (const [dx, dz] of clearanceSamples) {
      if (!this.plan.floors.some(r => Math.abs(p.x+dx-r.x)<=r.w/2 && Math.abs(p.z+dz-r.z)<=r.d/2)) return false;
    }
    return !this.plan.obstacles.some(r => Math.abs(p.x-r.x)<=r.w/2+BODY_RADIUS && Math.abs(p.z-r.z)<=r.d/2+BODY_RADIUS);
  }
  line(a: Point, b: Point): boolean {
    const n = Math.ceil(distance(a, b) / .18);
    for (let i = 0; i <= n; i++) if (!this.clear({ x: a.x + (b.x - a.x) * i / (n || 1), z: a.z + (b.z - a.z) * i / (n || 1) })) return false;
    return true;
  }
  point(id: number): Point { return { x: this.origin.x + id % this.width * this.cell, z: this.origin.z + Math.floor(id / this.width) * this.cell }; }
  nearest(p: Point, clear = (p: Point) => this.clear(p), line = (a: Point,b: Point) => this.line(a,b)): number {
    const cx = Math.round((p.x - this.origin.x) / this.cell), cz = Math.round((p.z - this.origin.z) / this.cell);
    let best = -1, dist = Infinity;
    for (let z = Math.max(0, cz - 5); z <= Math.min(this.depth - 1, cz + 5); z++) for (let x = Math.max(0, cx - 5); x <= Math.min(this.width - 1, cx + 5); x++) {
      const id = z * this.width + x, d = distance(p, this.point(id));
      if (this.open[id] && d < dist && clear(this.point(id)) && line(p, this.point(id))) { best = id; dist = d; }
    }
    return best;
  }
  path(start: Point, end: Point, occupied: Point[] = []): Point[] {
    const clearance = occupied.map(other=>({other,radius:Math.min(BODY_RADIUS*2+.08,distance(start,other)-.015)}));
    const free = (p: Point) => clearance.every(({other,radius}) => distance(p,other) > radius);
    const clear = (p: Point) => this.clear(p) && free(p);
    const line = (a: Point,b: Point) => {
      if(!this.line(a,b))return false;
      const n=Math.ceil(distance(a,b)/.2);
      for(let i=0;i<=n;i++)if(!free({x:a.x+(b.x-a.x)*i/(n||1),z:a.z+(b.z-a.z)*i/(n||1)}))return false;
      return true;
    };
    if (!clear(start) || !clear(end)) return [];
    if (line(start, end)) return [{ ...end }];
    const a = this.nearest(start,clear,line), b = this.nearest(end,clear,line);
    if (a < 0 || b < 0) return [];
    const cost = new Float64Array(this.open.length).fill(Infinity), previous = new Int32Array(this.open.length).fill(-1);
    const closed = new Uint8Array(this.open.length), heap: { id: number; score: number }[] = [];
    const push = (id: number, score: number) => {
      let i = heap.length; heap.push({ id, score });
      while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].score <= score) break; heap[i] = heap[parent]; i = parent; } heap[i] = { id, score };
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (heap[child].score >= last.score) break; heap[i] = heap[child]; i = child; } heap[i] = last; }
      return top.id;
    };
    cost[a] = 0; push(a, distance(this.point(a), end));
    while (heap.length) {
      const current = pop(); if (closed[current]) continue; closed[current] = 1;
      if (current === b) {
        const raw = [end]; for (let at = b; at !== -1; at = previous[at]) raw.push(this.point(at)); raw.push(start); raw.reverse();
        const smooth: Point[] = []; let i = 0;
        while (i < raw.length - 1) { let j = raw.length - 1; while (j > i + 1 && !line(raw[i], raw[j])) j--; smooth.push(raw[j]); i = j; }
        return smooth;
      }
      const x = current % this.width, z = Math.floor(current / this.width);
      for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx = x + dx, nz = z + dz, next = nz * this.width + nx;
        if (nx < 0 || nz < 0 || nx >= this.width || nz >= this.depth || !this.open[next] || closed[next] || !free(this.point(next))) continue;
        if (dx && dz && (!this.open[z * this.width + nx] || !this.open[nz * this.width + x] || !free(this.point(z*this.width+nx)) || !free(this.point(nz*this.width+x)))) continue;
        const g = cost[current] + this.cell * (dx && dz ? Math.SQRT2 : 1);
        if (g >= cost[next]) continue; cost[next] = g; previous[next] = current; push(next, g + distance(this.point(next), end));
      }
    }
    return [];
  }
}
