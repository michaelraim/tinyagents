import { packPlots, connectPlots } from './campus';
import { sessionsOf, type Agent, type Project, type Session, type Theme } from './protocol';

export type Point = { x: number; z: number };
export type Rect = Point & { w: number; d: number };
export type Seat = Point & { agent: Agent; desk: Point; facing: number; slot?: number };
export type Fixture = Rect & { kind: 'collab' | 'printer' | 'feature' };
export type Room = Rect & { id: string; projectId: string; name: string; theme: Theme; agents: Agent[]; session: Session; annex: number; first: boolean; side: number; doorZ: number; seats: Seat[]; fixtures: Fixture[]; columns: number; capacity: number };
export type OfficePlan = { rooms: Room[]; walkways: Rect[]; hall: Rect; lounge: Rect; reception: Rect; meeting: Rect; quiet?: Rect; bounds: Rect; floors: Rect[]; obstacles: Rect[]; destinations: Point[]; socialSpots: Record<'coffee'|'duck'|'arcade'|'standup', number[]> };

function generateCampus(projects: Project[], previous?: OfficePlan) {
  const count=projects.reduce((n,p)=>n+p.agents.length,0);
  const hubSize=8+4*Math.ceil(Math.sqrt(Math.max(1,count))/3);
  const specs: {id:string;group:string;w:number;d:number}[]=[{id:'hub',group:'commons',w:hubSize,d:hubSize}];
  const rooms:Room[]=[];
  for(const project of projects){let first=true;
    for(const session of sessionsOf(project)) {
      const oldRooms=previous?.rooms.filter(r=>r.projectId===project.id&&r.session.key===session.key)??[];
      const assigned=new Set(oldRooms.flatMap(r=>r.agents.map(a=>a.key)));
      const newcomers=session.agents.filter(a=>!assigned.has(a.key));
      const add=(room:Room)=>{rooms.push(room);specs.push({id:room.id,group:project.id,w:room.w,d:room.d});first=false;};
      for(const old of oldRooms) {
        const agents=old.agents.flatMap(a=>session.agents.find(b=>b.key===a.key)??[]);
        agents.push(...newcomers.splice(0,old.capacity-agents.length));
        if(agents.length) add({...old,name:project.name,theme:project.theme,session,agents,first});
      }
      let annex=oldRooms.reduce((n,r)=>Math.max(n,r.annex+1),0);
      while(newcomers.length) {
        const agents=newcomers.splice(0,12),cols=Math.min(5,Math.max(2,Math.ceil(Math.sqrt(agents.length*1.2))));
        const capacity=cols*Math.ceil(agents.length/cols),w=6+cols*4,d=6+Math.ceil(capacity/cols)*6;
        const id=`${project.id}:${session.key}:${annex}`;
        add({id,projectId:project.id,name:project.name,theme:project.theme,session,agents,w,d,x:0,z:0,side:1,doorZ:0,seats:[],fixtures:[],annex,first,columns:cols,capacity});annex++;
      }
    }
  }
  // Shared-space capacity follows the office population, with furniture clearance
  // as the minimum. They compete for land just like the project suites.
  const extra=2*Math.floor(Math.sqrt(count)/3);
  specs.push({id:'cafe',group:'commons',w:12+extra,d:12+extra},
    {id:'meeting',group:'commons',w:12+extra,d:14+extra},
    {id:'reception',group:'commons',w:12+extra,d:10+extra});
  const oldPlots=previous ? [...previous.rooms.map(r=>({...r,group:r.projectId})),...(['hall','lounge','meeting','reception'] as const).map((name,i)=>({...previous[name],id:['hub','cafe','meeting','reception'][i],group:'commons'}))] : [];
  for(const spec of specs.filter(s=>s.group==='commons')) {const old=oldPlots.find(p=>p.id===spec.id);if(old){spec.w=old.w;spec.d=old.d;}}
  const plots=packPlots(specs,oldPlots,previous?.walkways),get=(id:string)=>plots.find(p=>p.id===id)!;
  for(const room of rooms){const plot=get(room.id);Object.assign(room,{x:plot.x,z:plot.z});
    room.side=room.x<0?-1:1;room.doorZ=room.z+room.d/2-2.35;
    const cols=room.columns,oldSeats=room.seats;
    const used=new Set(oldSeats.filter(s=>room.agents.some(a=>a.key===s.agent.key)).map(s=>s.slot));
    room.seats=room.agents.map(agent=>{let i=oldSeats.find(s=>s.agent.key===agent.key)?.slot;if(i===undefined){i=0;while(used.has(i))i++;used.add(i);}const desk={x:room.x-(cols-1)*2.1+i%cols*4.2,z:room.z-room.d/2+3.5+Math.floor(i/cols)*5.4};const facing=i%2===0?0:Math.PI;return{agent,slot:i,desk,x:desk.x,z:desk.z+(facing===0?-1.65:1.65),facing};});
    room.fixtures=[{kind:'printer',x:room.x+room.side*(room.w/2-1.4),z:room.z+room.d/2-2.25,w:1.9,d:1.8}];
    if(room.capacity<=2)room.fixtures.push({kind:'feature',x:room.x-room.side*(room.w/2-1.8),z:room.z+.8,w:2,d:1.8});
  }
  const hall=get('hub'),lounge=get('cafe'),meeting=get('meeting'),reception=get('reception');
  const entrances=[...rooms.map(r=>({x:r.x-r.side*(r.w/2+1),z:r.doorZ})),...[lounge,meeting,reception].map(r=>({x:r.x+1,z:r.z+r.d/2+1}))];
  const walkways=connectPlots(plots,entrances,hall,previous?.walkways);
  return {rooms,hall,lounge,meeting,reception,walkways};
}

export function layoutRooms(projects:Project[]):Room[]{return generateCampus(projects).rooms;}
export function officePlan(projects: Project[], previous?: OfficePlan): OfficePlan {
  const {rooms,hall,lounge,meeting,reception,walkways}=generateCampus(projects,previous);
  const quiet:Rect|undefined=undefined;
  const floors:Rect[]=[...rooms,hall,lounge,meeting,reception,...walkways];
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
  obstacles.push({x:hall.x,z:hall.z,w:4,d:4});
  obstacles.push({x:hall.x-hall.w/2+2.7,z:hall.z-hall.d/2+2.7,w:4,d:4},{x:hall.x+hall.w/2-2,z:hall.z-hall.d/2+1.3,w:3,d:.9},{x:hall.x+hall.w/2-1.2,z:hall.z-hall.d/2+3,w:1.5,d:1.5});
  obstacles.push({x:lounge.x,z:lounge.z-lounge.d/2,w:lounge.w,d:.2},{x:meeting.x,z:meeting.z-meeting.d/2,w:meeting.w,d:.2},{x:meeting.x-meeting.w/2,z:meeting.z,w:.18,d:meeting.d});
  obstacles.push({ x: lounge.x, z: lounge.z - 3.7, w: 9, d: 1.4 },
    { x: lounge.x + 3.8, z: lounge.z + 1.6, w: 2, d: 3.5 },
    { x: lounge.x - 4.7, z: lounge.z + 3.9, w: 1.7, d: 1.6 },
    { x: lounge.x + 4.8, z: lounge.z + 4.5, w: 1, d: 1 },
    { x: meeting.x, z: meeting.z - 4.8, w: 3.1, d: 1 },
    { x: reception.x - 2.3, z: reception.z + 1.2, w: 5, d: 1.7 },
    { x: meeting.x - 1, z: meeting.z, w: 4.3, d: 6 });
  const destinations = [0,1,2,3].map(i => ({ x: lounge.x - 3.3 + i * 1.6, z: lounge.z - 1.5 }));
  destinations.push({ x: lounge.x + 1.6, z: lounge.z + 2.4 }, { x: reception.x + 4, z: reception.z + 1.5 });
  const socialSpots = { coffee: [destinations.length+6,destinations.length+7], duck: [destinations.length,destinations.length+1], arcade: [destinations.length+2,destinations.length+3], standup: [destinations.length+4,destinations.length+5] };
  destinations.push({x:meeting.x+2.5,z:meeting.z+1.8},{x:meeting.x+2.5,z:meeting.z-.2},
    {x:lounge.x-2.8,z:lounge.z+3.5},{x:lounge.x-1.6,z:lounge.z+4.6},
    {x:reception.x+2.5,z:reception.z+2.4},{x:reception.x+4.1,z:reception.z+2.4},
    {x:lounge.x-1.4,z:lounge.z+.4},{x:lounge.x+.5,z:lounge.z+.4});
  return { rooms, walkways, hall, lounge, reception, meeting, quiet, floors, obstacles, destinations, socialSpots,
    bounds: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ } };
}
