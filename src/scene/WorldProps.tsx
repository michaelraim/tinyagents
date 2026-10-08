import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { WorldHtml as Html } from './WorldHtml';
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { Box, Cylinder, Plant, Sofa, CoffeeSteam } from './Props';
import { VoxelModel } from './VoxelModel';
import { useSignFonts } from './useSignFonts';

type Point = [number, number, number];
export type WorldAction = 'coffee' | 'arcade' | 'fountain' | 'music';
export type Decor = 'lush' | 'playful' | 'minimal';

export const Sign = memo(function Sign({ text, color = '#43665c', ink = '#fff3d6', width = 3, height = .65, position = [0, 0, 0], rotation = [0, 0, 0] }: { text: string; color?: string; ink?: string; width?: number; height?: number; position?: Point; rotation?: Point }) {
  const fontsReady=useSignFonts();
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = ink; ctx.font = '600 78px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if(text==='tinyAGENTS'){
      ctx.textAlign='left';ctx.font='500 74px Fredoka, sans-serif';ctx.fillText('tiny',139,108);
      ctx.font='bold 80px monospace';ctx.fillText('AGENTS',281,108);
    }else ctx.fillText(text, 384, 104, 704);
    const tex = new CanvasTexture(canvas); tex.colorSpace = SRGBColorSpace; return tex;
  }, [text, color, ink,fontsReady]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={rotation}><planeGeometry args={[width, height]}/><meshStandardMaterial map={texture} roughness={.8}/></mesh>;
});

export const Tree = memo(function Tree({ position, scale = 1, pink = false, paused }: { position: Point; scale?: number; pink?: boolean; paused: boolean }) {
  const crown = useRef<Group>(null);
  useFrame(({clock}) => { if(crown.current && !paused) crown.current.rotation.z = Math.sin(clock.elapsedTime * .7 + position[0]) * .025; });
  return <group position={position} scale={scale}>
    <group ref={crown}><VoxelModel family="tree" color={pink?'#dca8af':'#83ad78'} scale={1.8}/></group>
    <Cylinder radius={.7} height={.12} color="#82ad74" position={[0,.02,0]}/>
  </group>;
});

export function InteractiveProp({ title, icon, position, onClick, children }: { title: string; icon: string; position: Point; onClick: () => void; children: React.ReactNode }) {
  const [hovered,setHovered] = useState(false);
  return <group position={position} onClick={e=>{e.stopPropagation();onClick();}} onPointerOver={e=>{e.stopPropagation();setHovered(true);document.body.style.cursor='pointer';}} onPointerOut={()=>{setHovered(false);document.body.style.cursor='auto';}}>
    {children}
    {hovered&&<Html center position={[0,3.6,0]} zIndexRange={[25,0]}><button className="prop-prompt" onClick={onClick}>{icon} {title}<small>CLICK TO PLAY</small></button></Html>}
  </group>;
}

export const Whiteboard = memo(function Whiteboard({ position, accent }: { position: Point; accent: string }) {
  return <group position={position}>
    <Box size={[2.9,1.75,.13]} color="#d2d6ce" position={[0,1.7,0]}/><Box size={[2.7,1.55,.05]} color="#faf5df" position={[0,1.7,.08]}/>
    {[-1.1,1.1].map(x=><group key={x}><Cylinder radius={.045} height={2.4} color="#647578" position={[x,1.2,0]}/><Box size={[.6,.08,.65]} color="#647578" position={[x,.08,0]}/></group>)}
    {Array.from({length:8},(_,i)=><Box key={i} size={[.35,.28,.016]} color={[accent,'#efc866','#eda39b'][i%3]} position={[-.9+(i%4)*.59,2.05-Math.floor(i/4)*.58,.12]} rotation={[0,0,(i%3-1)*.1]}/>)}
  </group>;
});

export const MeetingNook = memo(function MeetingNook({ position, color }: { position: Point; color: string }) {
  return <group position={position}>
    <Cylinder radius={1.65} height={.035} color={color} position={[0,.12,0]}/>
    <Cylinder radius={.88} height={.13} color="#e5b78d" position={[0,1.06,0]}/><Cylinder radius={.2} height={1} color="#bc9078" position={[0,.53,0]}/>
    {[0,Math.PI/2,Math.PI,Math.PI*1.5].map((a,i)=><group key={a} position={[Math.sin(a)*1.22,0,Math.cos(a)*1.22]} rotation={[0,a,0]}><Cylinder radius={.34} height={.14} color={i%2?'#ddb087':'#f2d9a2'} position={[0,.59,0]}/><Box size={[.6,.6,.12]} color={i%2?'#ddb087':'#f2d9a2'} position={[0,.84,.28]} radius={.15}/><Cylinder radius={.045} height={.5} color="#876e62" position={[0,.29,0]}/></group>)}
    <Plant position={[0,1.15,0]} scale={.33}/><Box size={[.45,.035,.34]} color="#849ab1" position={[.4,1.15,.23]} rotation={[0,.25,0]}/>
  </group>;
});

export function Arcade({ position, onAction, pulse, paused }: { position: Point; onAction: (action: WorldAction) => void; pulse: number; paused: boolean }) {
  const screen = useRef<MeshStandardMaterial>(null);
  useFrame(({clock})=>{if(screen.current && !paused)screen.current.emissiveIntensity=.6+Math.sin(clock.elapsedTime*4)*.2;});
  return <InteractiveProp title="One tiny high score?" icon="🕹️" position={position} onClick={()=>onAction('arcade')}>
    <Box size={[1.4,1.1,1.1]} color="#76588f" position={[0,.58,0]}/><Box size={[1.4,1.4,.57]} color="#9676aa" position={[0,1.75,-.24]}/>
    <Box size={[1.51,.37,1.05]} color="#d18cb4" position={[0,2.56,-.02]}/><Sign text="PIXEL BREAK" width={1.28} height={.25} position={[0,2.56,.516]} color="#433a62" ink="#ffe58b"/>
    <mesh position={[0,1.81,.063]} rotation={[-.08,0,0]}><planeGeometry args={[1.12,.82]}/><meshStandardMaterial ref={screen} color="#30405f" emissive="#426ba9" emissiveIntensity={.65}/></mesh>
    {Array.from({length:8},(_,i)=><Box key={i} size={[.1,.075,.02]} color={i%2?'#dbb2e6':'#a9d6b3'} position={[-.38+(i%4)*.25,1.96-Math.floor(i/4)*.22,.1]}/>)}
    <Box size={[1.4,.13,.8]} color="#b79acd" position={[0,1.2,.26]} rotation={[.12,0,0]}/><Cylinder radius={.06} height={.25} color="#374052" position={[-.3,1.43,.43]}/><mesh position={[-.3,1.57,.43]}><sphereGeometry args={[.13,12,8]}/><meshStandardMaterial color="#e98f9c"/></mesh>
    {[.18,.4].map(x=><Cylinder key={x} radius={.08} height={.05} color="#f5cd6a" position={[x,1.32,.45]}/>)}
    {pulse>0&&Date.now()-pulse<3200&&<Html center position={[0,3.1,0]}><div className="reward-pop">👾 HIGH SCORE!</div></Html>}
  </InteractiveProp>;
}

export function CafeCounter({ position, paused, onAction, pulse }: { position: Point; paused: boolean; onAction:(a:WorldAction)=>void; pulse:number }) {
  return <group position={position}>
    <Box size={[9.3,1.3,1.2]} color="#76a596" position={[0,.7,0]} radius={.1}/><Box size={[9.6,.17,1.5]} color="#f2daba" position={[0,1.42,0]} radius={.09}/>
    {[-3,-1,1,3].map(x=><Box key={x} size={[.028,1.06,.03]} color="#a2c2ae" position={[x,.71,.616]}/>)}
    <InteractiveProp title="Brew a little happiness" icon="☕" position={[-2,1.51,0]} onClick={()=>onAction('coffee')}>
      <Box size={[1.15,.9,.7]} color="#eee0ba" position={[0,.45,0]}/><Box size={[.88,.52,.04]} color="#4c665e" position={[0,.49,.37]}/><Box size={[1.2,.1,.94]} color="#91aea0" position={[0,.04,.12]}/>
      {[-.28,.28].map(x=><group key={x}><Cylinder radius={.1} height={.18} color="#f5f0db" position={[x,.18,.29]}/><Box size={[.08,.1,.08]} color="#6c8b7c" position={[x,.57,.42]}/></group>)}
      <CoffeeSteam position={[0,1.01,.2]} paused={paused}/>
    </InteractiveProp>
    {[-3.7,0,2.3].map((x,i)=><group key={x} position={[x,1.51,0]}><Cylinder radius={.3} height={.045} color="#f8edcb"/>{i===0?<Plant scale={.46}/>:<><Cylinder radius={.17} height={.12} color={i===1?'#bc8b50':'#e9a48b'} position={[0,.11,0]}/><Cylinder radius={.12} height={.12} color="#d5a766" position={[.22,.1,0]}/></>}</group>)}
    <Sign text="THE DAILY GRIND" width={4.9} height={.8} position={[0,3.2,-.4]} color="#4a7166"/>
    {[-3,0,3].map(x=><group key={x}><Cylinder radius={.41} height={.16} color="#efbd84" position={[x,.87,1.45]}/><Cylinder radius={.05} height={.83} color="#666d67" position={[x,.44,1.45]}/><Cylinder radius={.26} height={.08} color="#666d67" position={[x,.08,1.45]}/></group>)}
    {pulse>0&&Date.now()-pulse<3200&&<Html center position={[-2,3.2,.6]}><div className="reward-pop">☕ FRESHLY BREWED</div></Html>}
  </group>;
}

export function PingPong({ position, paused }: { position: Point; paused: boolean }) {
  const ball=useRef<Mesh>(null), time=useRef(0);
  useFrame((_,dt)=>{if(paused||!ball.current)return;time.current+=Math.min(dt,.05);ball.current.position.set(Math.sin(time.current*2)*1.65,1.35+Math.abs(Math.cos(time.current*2))*1.15,.25*Math.cos(time.current));});
  return <group position={position}>
    <Box size={[3.5,.13,2.1]} color="#6aaba4" position={[0,1.2,0]}/><Box size={[3.3,.008,.025]} color="#f4f0db" position={[0,1.271,0]}/>
    {[-1.6,1.6].map(x=><Box key={x} size={[.03,.01,2.02]} color="#f4f0db" position={[x,1.274,0]}/>)}
    <Box size={[.035,.37,2.2]} color="#f7e3bb" position={[0,1.45,0]}/>{[-1.3,1.3].flatMap(x=>[-.7,.7].map(z=><Box key={`${x}${z}`} size={[.09,1.12,.09]} color="#5d7775" position={[x,.6,z]}/>))}
    <mesh ref={ball}><sphereGeometry args={[.1,10,8]}/><meshStandardMaterial color="#fff6d6"/></mesh>
    <Cylinder radius={.16} height={.045} color="#ed967a" position={[-1.3,1.3,.55]}/><Box size={[.11,.04,.23]} color="#b19573" position={[-1.3,1.3,.76]}/>
  </group>;
}

export const Bench = memo(function Bench({ position, rotation = 0 }: { position: Point; rotation?: number }) {
  return <group position={position} rotation={[0,rotation,0]}>{[-.32,0,.32].map(z=><Box key={z} size={[2.5,.13,.24]} color="#c4936c" position={[0,.68,z]}/>)}{[.97,1.28].map(y=><Box key={y} size={[2.5,.22,.13]} color="#c4936c" position={[0,y,-.45]}/>)}{[-.9,.9].map(x=><Box key={x} size={[.12,.69,.85]} color="#55756d" position={[x,.34,0]}/>)}</group>;
});

export function Fountain({ position, paused, onAction, pulse }: { position: Point; paused:boolean; onAction:(a:WorldAction)=>void; pulse:number }) {
  const drops=useRef<Group>(null), t=useRef(0);
  useFrame((_,dt)=>{if(paused||!drops.current)return;t.current+=Math.min(dt,.05);drops.current.children.forEach((p,i)=>{const a=i*.79,phase=(t.current*.65+i*.1)%1;p.position.set(Math.cos(a)*phase*1.15,1.45+Math.sin(phase*Math.PI)*1.3-phase*.8,Math.sin(a)*phase*1.15);p.scale.setScalar(1-phase*.6);});});
  return <InteractiveProp title="Make a tiny wish" icon="✨" position={position} onClick={()=>onAction('fountain')}>
    <Cylinder radius={2} height={.38} color="#d6d8bd" position={[0,.21,0]}/><Cylinder radius={1.8} height={.07} color="#7ab9b8" position={[0,.43,0]}/>
    <Cylinder radius={.37} height={1.1} color="#e6dcc2" position={[0,.88,0]}/><Cylinder radius={.9} height={.17} color="#ddd4b8" position={[0,1.41,0]}/><Cylinder radius={.75} height={.05} color="#8fd1c5" position={[0,1.52,0]}/>
    <group ref={drops}>{Array.from({length:12},(_,i)=><mesh key={i}><sphereGeometry args={[.065,7,6]}/><meshStandardMaterial color="#c1efe3" emissive="#98cfc8" emissiveIntensity={.3}/></mesh>)}</group>
    {pulse>0&&Date.now()-pulse<3200&&<Html center position={[0,3,0]}><div className="reward-pop">✨ MAY YOUR TESTS BE GREEN</div></Html>}
  </InteractiveProp>;
}

export function StreetLamp({position, evening}: {position:Point;evening:boolean}) {
  return <group position={position}><Cylinder radius={.14} height={.25} color="#476559" position={[0,.15,0]}/><Cylinder radius={.055} height={3.6} color="#55756a" position={[0,1.9,0]}/><Box size={[.6,.08,.6]} color="#55756a" position={[0,3.8,0]}/><mesh position={[0,3.55,0]}><boxGeometry args={[.38,.44,.38]}/><meshStandardMaterial color="#ffedb9" emissive="#ffd392" emissiveIntensity={evening?1.8:.2}/></mesh></group>;
}

export function AmbientLife({ front, back, paused }: {front:number;back:number;paused:boolean}) {
  const car=useRef<Group>(null), butterflies=useRef<Group>(null), t=useRef(0);
  useFrame((_,dt)=>{if(paused)return;t.current+=Math.min(dt,.05);if(car.current)car.current.position.x=((t.current*2+10)%90)-45;if(butterflies.current)butterflies.current.children.forEach((g,i)=>{g.position.set(-22+Math.sin(t.current*.4+i*2)*2,1.4+Math.sin(t.current+i)*.6,back+4+i*6+Math.cos(t.current*.5+i)*1.4);g.rotation.y=t.current+i;g.children.forEach((w,j)=>w.rotation.z=(j?1:-1)*(.6+Math.sin(t.current*14)*.5));});});
  return <>
    <group ref={car} position={[0,-.1,front+9]}><Box size={[2.8,.67,1.25]} color="#eab485" position={[0,.5,0]} radius={.2}/><Box size={[1.37,.63,1.1]} color="#f5d4a8" position={[-.15,1.03,0]} radius={.15}/><Box size={[.92,.39,1.12]} color="#96bbc0" position={[-.12,1.05,0]}/>{[-.89,.89].flatMap(x=>[-.64,.64].map(z=><mesh key={`${x}${z}`} position={[x,.29,z]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.27,.27,.15,12]}/><meshStandardMaterial color="#4e5e61"/></mesh>))}</group>
    <group ref={butterflies}>{[0,1,2,3].map(i=><group key={i}>{[-1,1].map(x=><mesh key={x} position={[x*.08,0,0]} scale={[.13,.06,.2]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color={i%2?'#f3d174':'#e7adbf'}/></mesh>)}</group>)}</group>
  </>;
}

export const LoungeSeating = memo(function LoungeSeating(){return <group position={[-3.7,.1,2.6]}><Cylinder radius={2.35} height={.025} color="#e5ab9e" position={[0,.03,0]}/><Sofa position={[0,0,-1.2]} color="#dd947e"/><group rotation={[0,Math.PI/2,0]}><Sofa position={[-.5,0,1.75]} color="#edb89a"/></group><Cylinder radius={.85} height={.12} color="#efd9b4" position={[0,.57,.2]}/><Cylinder radius={.38} height={.5} color="#c49d7f" position={[0,.28,.2]}/><Plant position={[0,.65,.2]} scale={.38}/></group>});
