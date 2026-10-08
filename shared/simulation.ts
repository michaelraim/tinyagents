import { effectiveState, type Agent, type AgentState } from './protocol';
import type { OfficePlan, Point, Seat } from './layout';

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
  constructor(readonly plan: Pick<OfficePlan, 'bounds' | 'floors' | 'obstacles'>) {
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

export type SimBody = Point & { key: string; vx: number; vz: number; angle: number; travel: number; state: AgentState;
  phase: 'desk' | 'walking' | 'break' | 'away'; home: Seat; path: Point[]; target: 'home' | number; age: number; dwell: number; gait: number; stuck: number; bestDistance:number; progressAge:number; rendezvous?:string };

/** One fixed-step crowd simulation. Characters only render these positions. */
export class OfficeSimulation {
  readonly nav: Navigation;
  readonly bodies = new Map<string, SimBody>();
  private accumulator = 0;
  constructor(readonly plan: OfficePlan, previous?: OfficeSimulation) {
    this.nav = new Navigation(plan);
    for (const home of plan.rooms.flatMap(r => r.seats)) {
      const old = previous?.bodies.get(home.agent.key); if (!old) continue;
      const body: SimBody = { ...old, home, path: [...old.path] };
      if (!this.nav.clear(body)) { body.x = home.x; body.z = home.z; body.vx = body.vz = 0; }
      this.bodies.set(body.key, body);
      // A campus extension must not make seated people stand up or restart a break.
      const destination=old.target==='home'?home:plan.destinations[old.target];
      const oldDestination=old.target==='home'?old.home:previous!.plan.destinations[old.target];
      let from:Point=body;
      const pathClear=body.path.every(p=>{const clear=this.nav.line(from,p);from=p;return clear;});
      if(!pathClear || distance(destination,oldDestination)>.01 || distance(body,old)>.01) this.route(body,old.target);
    }
  }
  sync(agents: Agent[], now: number) {
    const seats = new Map(this.plan.rooms.flatMap(r => r.seats).map(s => [s.agent.key, s]));
    for (const agent of agents) {
      const home = seats.get(agent.key); if (!home) continue;
      let body = this.bodies.get(agent.key);
      const state = effectiveState(agent, now);
      if (!body) {
        body = { key: agent.key, x: home.x, z: home.z, vx: 0, vz: 0, angle: home.facing, travel: 0, state,
          phase: state === 'offline' ? 'away' : 'desk', home, path: [], target: 'home', age: 0, dwell: 0, gait: 0, stuck: 0,bestDistance:Infinity,progressAge:0 };
        this.bodies.set(agent.key, body);
      }
      if (body.state !== state) {
        body.state = state; body.age = 0;
        if (!['idle', 'done'].includes(state)) this.route(body, 'home');
      }
      body.home = home;
    }
    const present = new Set(agents.map(a => a.key));
    for (const key of this.bodies.keys()) if (!present.has(key)) this.bodies.delete(key);
  }
  route(body: SimBody, target: 'home' | number) {
    if(target==='home')body.rendezvous=undefined;
    const point = target === 'home' ? body.home : this.plan.destinations[target];
    const occupied = [...this.bodies.values()].filter(b=>b!==body && b.phase!=='walking' && b.phase!=='away');
    const path = this.nav.path(body, point, occupied);
    if (!path.length) return false;
    body.target = target; body.path = path; body.phase = 'walking'; body.stuck = 0;body.bestDistance=Infinity;body.progressAge=0;
    return true;
  }
  advance(delta: number) {
    this.accumulator += Math.min(delta, .15);
    while (this.accumulator >= 1 / 60) { this.step(1 / 60); this.accumulator -= 1 / 60; }
  }
  gather(keys: string[], kind: 'coffee'|'duck'|'arcade'|'standup'): number {
    const reserved = new Set([...this.bodies.values()].filter(b => !keys.includes(b.key) && b.target !== 'home').map(b=>b.target));
    const invited: {body:SimBody;slot:number;path:Point[]}[] = [];
    for (const key of keys) {
      const body = this.bodies.get(key);
      if (!body || !['idle','done'].includes(body.state)) return 0;
      const slot = this.plan.socialSpots[kind].find(index=>!reserved.has(index));
      if(slot===undefined)return 0;
      const occupied=[...this.bodies.values()].filter(b=>!keys.includes(b.key)&&b.phase!=='walking'&&b.phase!=='away');
      const path=this.nav.path(body,this.plan.destinations[slot],occupied);
      if(!path.length)return 0;
      reserved.add(slot);invited.push({body,slot,path});
    }
    for(const {body,slot,path} of invited){body.target=slot;body.path=path;body.phase='walking';body.stuck=0;body.bestDistance=Infinity;body.progressAge=0;body.dwell=0;body.age=0;body.rendezvous=keys.find(key=>key!==body.key);}
    return invited.length;
  }
  private move(body: SimBody, x: number, z: number) {
    // Substeps stay smaller than the collision radius; axis sliding never tunnels through furniture.
    const n = Math.max(1, Math.ceil(Math.hypot(x - body.x, z - body.z) / .15)), dx = (x - body.x) / n, dz = (z - body.z) / n;
    for (let i = 0; i < n; i++) {
      if (this.nav.clear({ x: body.x + dx, z: body.z + dz })) { body.x += dx; body.z += dz; }
      else if (this.nav.clear({ x: body.x + dx, z: body.z })) { body.x += dx; body.vz = 0; }
      else if (this.nav.clear({ x: body.x, z: body.z + dz })) { body.z += dz; body.vx = 0; }
      else { body.vx = 0; body.vz = 0; }
    }
  }
  private step(dt: number) {
    const bodies = [...this.bodies.values()];
    const reserved = new Set(bodies.filter(b => b.target !== 'home').map(b => b.target));
    const social = new Set(Object.values(this.plan.socialSpots).flat());
    bodies.forEach((body, i) => {
      body.age += dt;
      const relaxing = body.state === 'idle' || body.state === 'done';
      if (relaxing && body.phase === 'desk' && body.age > 4 + i % 5) {
        const slot = this.plan.destinations.findIndex((_, k) => !reserved.has(k) && !social.has(k));
        if (slot >= 0 && this.route(body, slot)) reserved.add(slot);
      }
      if (body.phase === 'break') {
        const companion=body.rendezvous?this.bodies.get(body.rendezvous):undefined;
        const waitingForCompanion=companion&&companion.rendezvous===body.key&&companion.phase==='walking'&&body.age<100;
        if(!waitingForCompanion)body.dwell+=dt;
        if (body.dwell > 12 + i % 7) { this.route(body, 'home'); body.dwell = 0; body.age = -10; }
      }
      // Do not orbit a corner waypoint while yielding to another pedestrian.
      while (body.path.length > 1 && distance(body, body.path[0]) < .5 && this.nav.line(body, body.path[1]) && bodies.every(b=>b===body||b.phase==='walking'||b.phase==='away'||distance(b,body.path[0])>1.5)) {body.path.shift();body.bestDistance=Infinity;}
      const target = body.path[0]; let tx = 0, tz = 0;
      if (target) {
        const dx = target.x - body.x, dz = target.z - body.z, len = Math.hypot(dx, dz);
        if(len<body.bestDistance-.08){body.bestDistance=len;body.progressAge=0;}else body.progressAge+=dt;
        if (len < .12) {
          body.path.shift();body.bestDistance=Infinity;
          if (!body.path.length) { body.phase = body.target === 'home' ? body.state === 'offline' ? 'away' : 'desk' : 'break'; body.vx = body.vz = 0; }
        } else {
          const pace = (body.target === 'home' ? 2.2 : 1.65) * Math.min(1, len / .6 + .15);
          tx = dx / len * pace; tz = dz / len * pace;
          // Predict collisions and keep right. Static coworkers keep their workstation.
          for (const other of bodies) {
            if (other === body || other.phase === 'away') continue;
            const ox = body.x + body.vx * .35 - other.x - other.vx * .35, oz = body.z + body.vz * .35 - other.z - other.vz * .35;
            const d = Math.hypot(ox, oz);
            if (d < 1.35 && d > .001) { const force = (1.35 - d) * 2; tx += ox / d * force; tz += oz / d * force; tx += dz / len * .5; tz -= dx / len * .5; }
          }
          const magnitude = Math.hypot(tx, tz); if (magnitude > 2.3) { tx *= 2.3 / magnitude; tz *= 2.3 / magnitude; }
        }
      }
      const blend = 1 - Math.exp(-dt * 7);
      body.vx += (tx - body.vx) * blend; body.vz += (tz - body.vz) * blend;
      const before = { x: body.x, z: body.z };
      this.move(body, body.x + body.vx * dt, body.z + body.vz * dt);
      body.travel = distance(before, body) / dt;
      body.gait += distance(before, body) * 4.6;
      const companion=body.rendezvous?this.bodies.get(body.rendezvous):undefined;
      const angle = body.travel > .12 ? Math.atan2(body.vx, body.vz) : body.phase === 'break' && companion ? Math.atan2(companion.x-body.x,companion.z-body.z) : body.phase === 'break' ? Math.PI : body.home.facing;
      body.angle += Math.atan2(Math.sin(angle - body.angle), Math.cos(angle - body.angle)) * (1 - Math.exp(-dt * 9));
      body.stuck = target && body.travel < .08 ? body.stuck + dt : 0;
      if (body.stuck > 1.2 || body.progressAge > 2) this.route(body, body.target);
    });
    // Iterative disc contacts, constrained by the static world on every correction.
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j]; if (a.phase === 'away' || b.phase === 'away') continue;
      const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), overlap = BODY_RADIUS * 2 - d;
      if (overlap <= 0) continue;
      const ax = d > .001 ? dx / d : 1, az = d > .001 ? dz / d : 0;
      const wa = a.phase === 'walking' ? 1 : 0, wb = b.phase === 'walking' ? 1 : 0, sum = wa + wb;
      if (!sum) continue;
      this.move(a, a.x + ax * overlap * wa / sum, a.z + az * overlap * wa / sum);
      this.move(b, b.x - ax * overlap * wb / sum, b.z - az * overlap * wb / sum);
    }
  }
}
