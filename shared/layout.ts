import { sessionsOf, type Agent, type Project, type Session, type Theme } from './protocol';

export type Point = { x: number; z: number };
export type Rect = Point & { w: number; d: number };
export type Seat = Point & { agent: Agent; desk: Point; facing: number };
export type Fixture = Rect & { kind: 'collab' | 'printer' | 'feature' };
export type Room = Rect & { id: string; projectId: string; name: string; theme: Theme; agents: Agent[]; session: Session; annex: number; first: boolean; side: number; doorZ: number; seats: Seat[]; fixtures: Fixture[] };
export type OfficePlan = { rooms: Room[]; hall: Rect; lounge: Rect; reception: Rect; meeting: Rect; quiet?: Rect; bounds: Rect; floors: Rect[]; obstacles: Rect[]; destinations: Point[] };

export function layoutRooms(projects: Project[]): Room[] {
  const cursors = [-17, -17], rooms: Room[] = [];
  projects.forEach(project => {
    const sideIndex = cursors[0] <= cursors[1] ? 0 : 1, side = sideIndex ? 1 : -1;
    let first = true;
    for (const session of sessionsOf(project)) {
      for (let offset = 0; offset < session.agents.length; offset += 6) {
        const agents = session.agents.slice(offset, offset + 6), cols = agents.length > 2 ? 3 : agents.length;
        const w = cols === 1 ? 9 : cols === 2 ? 12.4 : 16.6;
        const d = 7.3 + Math.ceil(agents.length / cols) * 4.6;
        const x = side * (2.5 + w / 2), z = cursors[sideIndex] + d / 2;
        const seats = agents.map((agent, i) => {
          const desk = { x: x - (cols - 1) * 2.1 + (i % cols) * 4.2, z: z - d / 2 + 3.5 + Math.floor(i / cols) * 4.6 };
          const facing = i % 2 === 0 ? 0 : Math.PI;
          return { agent, desk, x: desk.x, z: desk.z + (facing === 0 ? -1.65 : 1.65), facing };
        });
        const fixtures: Fixture[] = [{kind:'printer',x:x+side*(w/2-1.4),z:z+d/2-2.25,w:1.9,d:1.8}];
        if(agents.length===4) fixtures.push({kind:'collab',x:x+2.1,z:z-d/2+7.6,w:4.2,d:3.2});
        if(agents.length<=2) fixtures.push({kind:'feature',x:x-side*(w/2-1.8),z:z+.8,w:2,d:1.8});
        rooms.push({ id: `${project.id}:${session.key}:${offset / 6}`, projectId: project.id, name: project.name, theme: project.theme,
          session, agents, x, z, w, d, side, doorZ: z + d / 2 - 2.35, seats, fixtures, annex: offset / 6, first });
        first = false; cursors[sideIndex] += d + .4;
      }
    }
    cursors[sideIndex] += 1.8;
  });
  return rooms;
}

export function officePlan(projects: Project[]): OfficePlan {
  const rooms = layoutRooms(projects), end = Math.max(-2, ...rooms.map(r => r.z + r.d / 2));
  const hall = { x: 0, z: (end - 17) / 2, w: 5, d: end + 17 };
  const reception = { x: 0, z: end + 4.5, w: 14, d: 9 };
  const lounge = { x: 12.9, z: end + 5.5, w: 11.8, d: 11 };
  const meeting = { x: -12.1, z: end + 6.5, w: 10.2, d: 13 };
  const sideEnds = [-1,1].map(side=>Math.max(-17,...rooms.filter(r=>r.side===side).map(r=>r.z+r.d/2)));
  const shortSide = sideEnds[0] < sideEnds[1] ? -1 : 1, shortEnd = Math.min(...sideEnds);
  const quiet = rooms.length && end-shortEnd>6 ? { x:shortSide*7.15,z:(end+shortEnd+.4)/2,w:9.3,d:end-shortEnd-.4 } : undefined;
  const floors: Rect[] = [...rooms, hall, reception, lounge, meeting,...(quiet?[quiet]:[])];
  const minX = Math.min(...floors.map(r => r.x - r.w / 2)), maxX = Math.max(...floors.map(r => r.x + r.w / 2));
  const minZ = Math.min(...floors.map(r => r.z - r.d / 2)), maxZ = Math.max(...floors.map(r => r.z + r.d / 2));
  const obstacles: Rect[] = [];
  for (const room of rooms) {
    // A real doorway in each inner wall. The same rectangles drive rendering and collision.
    const inner = room.x - room.side * room.w / 2, outer = room.x + room.side * room.w / 2;
    obstacles.push({ x: room.x, z: room.z - room.d / 2, w: room.w, d: .22 },
      { x: room.x, z: room.z + room.d / 2, w: room.w, d: .22 }, { x: outer, z: room.z, w: .22, d: room.d });
    const doorBack = room.d - 3.65;
    obstacles.push({ x: inner, z: room.z - room.d / 2 + doorBack / 2, w: .22, d: doorBack },
      { x: inner, z: room.z + room.d / 2 - .525, w: .22, d: 1.05 });
    for (const seat of room.seats) obstacles.push({ x: seat.desk.x, z: seat.desk.z, w: 3.1, d: 1.5 });
    obstacles.push(...room.fixtures);
    // Shared storage and display ledge; personal items sit on the desks.
    obstacles.push({ x: room.x, z: room.z - room.d / 2 + .65, w: room.w - 1, d: 1 });
  }
  obstacles.push({ x: lounge.x, z: lounge.z - 3.7, w: 9, d: 1.4 },
    { x: lounge.x + 3.8, z: lounge.z + 1.6, w: 2, d: 3.5 },
    { x: lounge.x - 4.7, z: lounge.z + 3.9, w: 1.7, d: 1.6 },
    { x: lounge.x + 4.8, z: lounge.z + 4.5, w: 1, d: 1 },
    { x: meeting.x, z: meeting.z - 4.8, w: 3.1, d: 1 },
    { x: reception.x - 2.3, z: reception.z + 1.2, w: 5, d: 1.7 },
    { x: meeting.x - 1, z: meeting.z, w: 4.3, d: 6 });
  const destinations = [0,1,2,3].map(i => ({ x: lounge.x - 3.3 + i * 1.6, z: lounge.z - 1.5 }));
  destinations.push({ x: lounge.x + 1.6, z: lounge.z + 2.4 }, { x: reception.x + 4, z: reception.z + 1.5 });
  if(quiet){
    obstacles.push({x:quiet.x,z:quiet.z-quiet.d/2+1.6,w:7.2,d:2.9});
    destinations.push({x:quiet.x-1.6,z:quiet.z+quiet.d/2-2},{x:quiet.x+1.6,z:quiet.z+quiet.d/2-2});
  }
  return { rooms, hall, lounge, reception, meeting, quiet, floors, obstacles, destinations,
    bounds: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ } };
}
