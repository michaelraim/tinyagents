import { sessionsOf, type Agent, type Project, type Session } from './protocol';

/**
 * The office building: one corridor spine running along +x, with rooms snug
 * against it on the north (z < 0) and south (z > 0) sides.
 *
 * - Each project is one room. Each session inside it is a desk pod.
 * - Amenity rooms (lobby, café, lounge) sit on the same spine.
 * - Everything the renderer draws and everything the navigation grid avoids comes
 *   from this one plan, so furniture and collision can never disagree.
 */

export type Point = { x: number; z: number };
export type Rect = Point & { w: number; d: number };
/** North rooms open to the corridor on their south wall (+z), south rooms on their north wall (-z). */
export type Side = -1 | 1;

export type Seat = Point & {
  agent: Agent;
  /** Angle the seated character faces (0 = +z). */
  facing: number;
  /** Centre of this seat's desk segment. */
  desk: Point;
  podId: string;
};

export type Pod = Rect & {
  id: string;
  /** Spare desks have no session; they make rooms look like real, furnished offices. */
  session?: Session;
  /** Desk segments per side. */
  columns: number;
  seats: Seat[];
};

export type DecorKind = 'bookshelf' | 'whiteboard' | 'plant' | 'plant-tall' | 'plant-small' | 'sofa' | 'coffee-table' | 'rug' | 'tv' | 'lamp' | 'armchair' | 'feature'
  | 'cabinet' | 'cooler' | 'coatrack' | 'poster' | 'wall-shelf' | 'bin';
/** Furniture that isn't a desk. `rot` is the angle the front of the piece faces (0 = +z). */
export type Decor = Rect & { kind: DecorKind; rot: number; solid: boolean; slot?: number };
export type SpotKind = 'coffee' | 'cafe-seat' | 'sofa' | 'pingpong' | 'arcade' | 'whiteboard' | 'window' | 'cooler' | 'reception';
/** ack shifts a seated person backwards from the spot onto the seat (sofas). */
export type Spot = Point & { id: string; kind: SpotKind; facing: number; sit: boolean; back: number; roomId: string };

export type RoomKind = 'project' | 'lobby' | 'cafe' | 'lounge';
export type Room = Rect & {
  id: string;
  kind: RoomKind;
  side: Side;
  /** Door centre on the corridor wall. */
  door: Point;
  project?: Project;
  pods: Pod[];
  /** Colour slot for project rooms; stable per project. */
  slot: number;
  decor: Decor[];
  /** Depth of the room immediately before this one on the same side (for shared walls). */
  previousDepth: number;
  last: boolean;
};

export type Building = {
  rooms: Room[];
  corridor: Rect;
  /** Where people enter and leave the building. */
  entrance: Point;
  floors: Rect[];
  obstacles: (Rect & { tag: string })[];
  spots: Spot[];
  seats: Seat[];
  bounds: Rect;
};

export const WALL = 0.2;
export const CORRIDOR_WIDTH = 4;
const DOOR_WIDTH = 1.8;
const SEAT_PITCH = 1.35;
const POD_DEPTH = 4.1;
const POD_GAP = 1.1;
const LEFT_ZONE = 2.3; // whiteboard wall
const SIDE_ZONE = 4.4; // lounge corner
const BACK_STRIP = 1.7;
const FRONT_AISLE = 1.6;
const MAX_POD_COLUMNS = 3;
const MAX_POD_ROWS = 2;

type PodDraft = { session?: Session; agents: Agent[] };

/** Split each session into pods of up to 2 × MAX_POD_COLUMNS seats, lead first, children next to their parent. */
function podsFor(project: Project): PodDraft[] {
  const pods: PodDraft[] = [];
  for (const session of sessionsOf(project)) {
    const perPod = MAX_POD_COLUMNS * 2;
    for (let i = 0; i < session.agents.length; i += perPod) {
      pods.push({ session, agents: session.agents.slice(i, i + perPod) });
    }
  }
  return pods;
}

/** Pods always have at least four desks, so a solo agent still sits in a proper office. */
function podSize(seatCount: number) {
  const columns = Math.max(2, Math.ceil(seatCount / 2));
  return { columns, w: columns * SEAT_PITCH + 0.9, d: POD_DEPTH };
}

type Draft = { id: string; kind: RoomKind; w: number; d: number; project?: Project; pods: PodDraft[]; slot: number; rows: number; cols: number; cell: number };

function projectDraft(project: Project, slot: number): Draft {
  const pods = podsFor(project);
  const rows = pods.length >= 2 ? MAX_POD_ROWS : 1;
  const cols = Math.max(1, Math.ceil(pods.length / rows));
  // Fill the grid with spare desks so rooms feel furnished and ready to grow.
  while (pods.length < rows * cols) pods.push({ agents: [] });
  const cell = Math.max(...pods.map(p => podSize(p.agents.length).w));
  const w = LEFT_ZONE + cols * cell + (cols - 1) * POD_GAP + 0.8 + SIDE_ZONE;
  const d = Math.max(9, BACK_STRIP + FRONT_AISLE + rows * POD_DEPTH + (rows - 1) * POD_GAP);
  // Whole units so walls line up neatly.
  return { id: `project:${project.id}`, kind: 'project', w: Math.ceil(w), d: Math.ceil(d), project, pods, slot, rows, cols, cell };
}
export type BuildingMemory = { slots: Record<string, number>; nextSlot: number };
export const emptyMemory = (): BuildingMemory => ({ slots: {}, nextSlot: 0 });

/**
 * Build the office. `memory` keeps project colour slots stable across updates;
 * it is updated in place.
 */
export function planBuilding(projects: Project[], memory: BuildingMemory = emptyMemory()): Building {
  const population = projects.reduce((n, p) => n + p.agents.length, 0);
  const extra = Math.min(6, Math.floor(population / 8)) * 1;

  const drafts: { draft: Draft; side: Side }[] = [];
  const cursor: Record<Side, number> = { [-1]: 0, [1]: 0 } as Record<Side, number>;
  const place = (draft: Draft, side: Side) => {
    drafts.push({ draft, side });
    cursor[side] += draft.w;
  };

  place({ id: 'lobby', kind: 'lobby', w: 10, d: 9, pods: [], slot: -1, rows: 0, cols: 0, cell: 0 }, 1);
  place({ id: 'cafe', kind: 'cafe', w: 12 + extra, d: 10, pods: [], slot: -1, rows: 0, cols: 0, cell: 0 }, -1);

  for (const project of projects) {
    if (memory.slots[project.id] === undefined) memory.slots[project.id] = memory.nextSlot++;
    const draft = projectDraft(project, memory.slots[project.id]);
    // Keep both sides of the corridor roughly the same length.
    const side: Side = cursor[-1] <= cursor[1] ? -1 : 1;
    place(draft, side);
  }

  const loungeSide: Side = cursor[-1] <= cursor[1] ? -1 : 1;
  place({ id: 'lounge', kind: 'lounge', w: 13 + extra, d: 10, pods: [], slot: -1, rows: 0, cols: 0, cell: 0 }, loungeSide);

  const length = Math.max(cursor[-1], cursor[1]);
  const corridor: Rect = { x: length / 2, z: 0, w: length, d: CORRIDOR_WIDTH };

  const rooms: Room[] = [];
  const offset: Record<Side, number> = { [-1]: 0, [1]: 0 } as Record<Side, number>;
  const previousDepth: Record<Side, number> = { [-1]: 0, [1]: 0 } as Record<Side, number>;
  for (const { draft, side } of drafts) {
    const x = offset[side] + draft.w / 2;
    const z = side * (CORRIDOR_WIDTH / 2 + draft.d / 2);
    offset[side] += draft.w;
    const room: Room = {
      id: draft.id, kind: draft.kind, side, x, z, w: draft.w, d: draft.d,
      door: { x, z: side * (CORRIDOR_WIDTH / 2) },
      project: draft.project, pods: [], decor: [], slot: draft.slot,
      previousDepth: previousDepth[side], last: false,
    };
    previousDepth[side] = draft.d;
    if (draft.kind === 'project') room.pods = layoutPods(room, draft);
    rooms.push(room);
  }
  for (const side of [-1, 1] as Side[]) {
    const onSide = rooms.filter(r => r.side === side);
    if (onSide.length) onSide[onSide.length - 1].last = true;
  }

  // Doors sit near the corridor end of each room, offset towards the lobby so the
  // walk from the entrance is short and the middle of the wall stays free.
  for (const room of rooms) room.door = { x: room.x - room.w / 2 + Math.min(2.4, room.w / 3), z: room.side * (CORRIDOR_WIDTH / 2) };

  const lobby = rooms.find(r => r.kind === 'lobby')!;
  const entrance: Point = { x: lobby.x, z: lobby.z + lobby.d / 2 + 1.2 };

  const floors: Rect[] = [{ ...corridor, w: corridor.w - WALL, d: corridor.d - WALL }];
  const obstacles: Building['obstacles'] = [];
  const spots: Spot[] = [];
  for (const room of rooms) {
    floors.push({ x: room.x, z: room.z, w: room.w - WALL, d: room.d - WALL });
    // Door opening through the corridor wall.
    floors.push({ x: room.door.x, z: room.door.z, w: DOOR_WIDTH, d: WALL * 3 });
    furnish(room, obstacles, spots);
  }
  // Front door and the step outside it.
  floors.push({ x: entrance.x, z: lobby.z + lobby.d / 2, w: DOOR_WIDTH, d: WALL * 3 });
  floors.push({ x: entrance.x, z: entrance.z, w: 3, d: 2.4 });

  const seats = rooms.flatMap(r => r.pods.flatMap(p => p.seats));
  for (const room of rooms) for (const pod of room.pods) {
    obstacles.push({ tag: 'desk', x: pod.x, z: pod.z, w: pod.columns * SEAT_PITCH, d: 1.96 });
  }

  const minX = Math.min(...floors.map(r => r.x - r.w / 2)) - 1, maxX = Math.max(...floors.map(r => r.x + r.w / 2)) + 1;
  const minZ = Math.min(...floors.map(r => r.z - r.d / 2)) - 1, maxZ = Math.max(...floors.map(r => r.z + r.d / 2)) + 1;
  return {
    rooms, corridor, entrance, floors, obstacles, spots, seats,
    bounds: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ },
  };
}

function layoutPods(room: Room, draft: Draft): Pod[] {
  const { rows, cell } = draft;
  // Pods fill from the corridor side so the team is visible first.
  const corridorZ = room.z - room.side * room.d / 2;
  const left = room.x - room.w / 2;
  return draft.pods.map((pod, i) => {
    const row = i % rows, column = Math.floor(i / rows);
    const { columns: seatColumns, w, d } = podSize(pod.agents.length);
    const x = left + LEFT_ZONE + column * (cell + POD_GAP) + cell / 2;
    const z = corridorZ + room.side * (FRONT_AISLE + POD_DEPTH / 2 + row * (POD_DEPTH + POD_GAP));
    const id = `${room.id}:pod:${i}`;
    const seats: Seat[] = pod.agents.map((agent, k) => {
      // The lead takes the first seat; teammates fill in around them.
      const seatColumn = Math.floor(k / 2), across = k % 2 === 0 ? 1 : -1;
      const deskX = x + (seatColumn - (seatColumns - 1) / 2) * SEAT_PITCH;
      return {
        agent, podId: id,
        x: deskX, z: z + across * 1.45,
        desk: { x: deskX, z: z + across * 0.42 },
        facing: across > 0 ? Math.PI : 0,
      };
    });
    return { id, session: pod.session, columns: seatColumns, x, z, w, d, seats };
  });
}
/** Amenity furniture: obstacles for navigation and spots people can visit. */
function furnish(room: Room, obstacles: Building['obstacles'], spots: Spot[]) {
  const back = room.z + room.side * room.d / 2; // far wall z
  const inward = -room.side; // direction from the far wall towards the corridor
  const left = room.x - room.w / 2, right = room.x + room.w / 2;
  const spot = (kind: SpotKind, x: number, z: number, facing: number, sit = false, back = 0) =>
    spots.push({ id: `${room.id}:${kind}:${spots.length}`, kind, x, z, facing, sit, back, roomId: room.id });
  const decor = (kind: DecorKind, x: number, z: number, w: number, d: number, rot: number, solid = true, slot?: number) => {
    room.decor.push({ kind, x, z, w, d, rot, solid, slot });
    if (solid) obstacles.push({ tag: kind, x, z, w, d });
  };
  const faceBack = room.side > 0 ? 0 : Math.PI; // facing the far wall
  const faceFront = faceBack + Math.PI;

  if (room.kind === 'cafe') {
    // Counter along the far wall with the coffee machine.
    obstacles.push({ tag: 'counter', x: room.x, z: back + inward * 0.75, w: room.w - 2.4, d: 1.1 });
    for (let i = 0; i < 3; i++) spot('coffee', room.x - 2 + i * 2, back + inward * 1.85, faceBack);
    // Round tables with two seats each.
    const tables = Math.max(2, Math.floor((room.w - 3) / 4));
    for (let i = 0; i < tables; i++) {
      const tx = left + 2.2 + i * ((room.w - 4.4) / Math.max(1, tables - 1));
      const tz = room.z + inward * 1.2;
      obstacles.push({ tag: 'table', x: tx, z: tz, w: 1.2, d: 1.2 });
      spot('cafe-seat', tx - 1.05, tz, Math.PI / 2, true);
      spot('cafe-seat', tx + 1.05, tz, -Math.PI / 2, true);
    }
    spot('window', right - 1.4, room.z + inward * -1.2, faceBack);
  }

  if (room.kind === 'lounge') {
    // Sofa against the far wall, ping-pong in the middle, arcade machines on the side.
    // Only the backrest blocks walking, so people can step up to the seat and sit down.
    obstacles.push({ tag: 'sofa', x: left + 3.2, z: back + inward * 0.4, w: 4.2, d: 0.5 });
    for (let i = 0; i < 3; i++) spot('sofa', left + 1.9 + i * 1.3, back + inward * 1.1, faceFront, true, 0.32);
    obstacles.push({ tag: 'coffee-table', x: left + 3.2, z: back + inward * 2.5, w: 2, d: 0.9 });
    const pongX = room.x + 2, pongZ = room.z + inward * 0.6;
    obstacles.push({ tag: 'pingpong', x: pongX, z: pongZ, w: 2.8, d: 1.6 });
    spot('pingpong', pongX - 2.05, pongZ, Math.PI / 2);
    spot('pingpong', pongX + 2.05, pongZ, -Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const ax = right - 1.2 - i * 1.4;
      obstacles.push({ tag: 'arcade', x: ax, z: back + inward * 0.6, w: 1.1, d: 0.9 });
      spot('arcade', ax, back + inward * 1.55, faceBack);
    }
  }

  if (room.kind === 'lobby') {
    obstacles.push({ tag: 'reception', x: room.x + 1.5, z: room.z - 0.4, w: 3.4, d: 1.1 });
    spot('reception', room.x + 1.5, room.z - 1.4, 0);
    obstacles.push({ tag: 'cooler', x: left + 1, z: room.z - room.d / 2 + 2.2, w: 0.7, d: 0.7 });
    spot('cooler', left + 1.9, room.z - room.d / 2 + 2.2, -Math.PI / 2);
    obstacles.push({ tag: 'bench', x: right - 1, z: room.z + 1.5, w: 0.9, d: 3 });
  }

  if (room.kind === 'project') {
    const mid = room.z + inward * 0.1;
    const faceRight = Math.PI / 2, faceLeft = -Math.PI / 2;
    const backFace = room.side > 0 ? Math.PI : 0; // pieces on the far wall face into the room
    // Whiteboard on the left wall; thinkers pace in front of it.
    decor('whiteboard', left + 0.18, mid, 0.2, 2.4, faceRight);
    spot('whiteboard', left + 1.35, mid - 0.5, faceLeft);
    spot('whiteboard', left + 1.35, mid + 0.5, faceLeft);
    decor('bookshelf', left + 1.25, back + inward * 0.33, 1.6, 0.5, backFace);
    decor('plant', left + 0.55, room.z - room.side * (room.d / 2 - 0.55), 0.5, 0.5, 0);
    // Lounge corner on the right: sofa against the wall, coffee table, armchair, rug and lamp.
    const sofaZ = mid;
    decor('rug', right - 2.4, sofaZ, 4.2, 3.4, 0, false);
    decor('sofa', right - 0.36, sofaZ, 0.5, 2.4, faceLeft);
    spot('sofa', right - 1.0, sofaZ - 0.6, faceLeft, true, 0.3);
    spot('sofa', right - 1.0, sofaZ + 0.6, faceLeft, true, 0.3);
    decor('coffee-table', right - 2.2, sofaZ, 0.7, 1.3, 0);
    decor('armchair', right - 3.95, sofaZ, 0.4, 1.0, faceRight);
    spot('sofa', right - 3.3, sofaZ, faceRight, true, 0.3);
    decor('plant-tall', right - 0.6, back + inward * 0.6, 0.7, 0.7, 0);
    decor('lamp', right - 0.55, room.z - room.side * (room.d / 2 - 0.55), 0.4, 0.4, 0);
    // Signature pieces for the project's topic along the back wall, and a topic sign by the door.
    const from = left + 2.9, to = right - 1.6, count = Math.min(3, Math.floor((to - from) / 1.9));
    for (let i = 0; i < count; i++) decor('feature', from + (i + 0.5) * ((to - from) / count), back + inward * 0.5, 1.3, 0.8, backFace, true, i);
    // Plants between the signature pieces, and a shelf of plants above the bookcase.
    for (let i = 1; i < count; i++) decor('plant-small', from + i * ((to - from) / count), back + inward * 0.35, 0.4, 0.4, 0, false);
    decor('wall-shelf', left + 1.25, back + inward * 0.12, 1.4, 0.2, backFace, false);
    // Along the corridor wall: coat rack by the door, filing cabinets and a water cooler.
    const front = room.z - room.side * (room.d / 2 - 0.4);
    decor('coatrack', room.door.x + 1.35, front, 0.45, 0.45, 0);
    decor('cabinet', right - 1.5, front, 0.9, 0.5, backFace + Math.PI);
    decor('cooler', right - 2.5, front, 0.55, 0.55, backFace + Math.PI);
    decor('bin', room.door.x + 2.0, front, 0.3, 0.3, 0, false);
    // Posters either side of the whiteboard.
    if (room.d >= 10) for (const dz of [-2.1, 2.1]) decor('poster', left + 0.13, mid + dz, 0.05, 0.9, faceRight, false, dz < 0 ? 0 : 1);
  }
}