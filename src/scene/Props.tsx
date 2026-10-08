import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import { CanvasTexture, Group } from 'three';
import { VoxelModel } from './VoxelModel';

export function Box({ size, color, position = [0, 0, 0], radius = 0.035, ...props }: { size: [number, number, number]; color: string; radius?: number } & Omit<ThreeElements['mesh'], 'args' | 'ref'>) {
  return <mesh position={position} castShadow receiveShadow {...props}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={0.83}/></mesh>;
}
export function Cylinder({ radius = .2, height = .5, color, position = [0, 0, 0] }: { radius?: number; height?: number; color: string; position?: [number, number, number] }) {
  return <mesh position={position} castShadow receiveShadow><cylinderGeometry args={[radius, radius * .9, height, 12]} /><meshStandardMaterial color={color} roughness={.8} /></mesh>;
}
export const Plant = memo(function Plant({ position = [0, 0, 0], scale = 1 }: { position?: [number, number, number]; scale?: number }) {
  return <VoxelModel family="plant" color="#91b580" position={position} scale={scale*.72}/>;
});
export const Desk = memo(function Desk({ position, accent }: { position: [number, number, number]; accent: string }) {
  return <group position={position}>
    <Box size={[2.55, .16, 1.13]} color="#c9a482" position={[0, 1.05, 0]} radius={.065} />
    {[-1.06, 1.06].flatMap(x => [-.38, .38].map(z => <Box key={`${x}-${z}`} size={[.10, 1, .1]} color="#8e7769" position={[x, .5, z]} />))}
    <Box size={[.32, .06, .29]} color="#555763" position={[0, 1.16, -.2]} />
    <Box size={[.08, .31, .08]} color="#555763" position={[0, 1.3, -.27]} />
    <Box size={[1.06, .67, .085]} color="#53545c" position={[0, 1.65, -.3]} />
    <Box size={[.93, .54, .015]} color="#303d48" position={[0, 1.65, -.247]} radius={.01} />
    {[0, 1, 2, 3, 4].map(i => <Box key={i} size={[.18 + (i % 3) * .17, .023, .014]} color={i % 2 ? '#bba9db' : '#97c6b1'} position={[-.15 + (i % 2) * .065, 1.82 - i * .08, -.23]} radius={.002} />)}
    <Box size={[.65, .045, .24]} color="#eee9e5" position={[0, 1.16, .29]} />
    <Box size={[.16, .05, .21]} color="#eee9e5" position={[.5, 1.16, .3]} />
    <Cylinder radius={.09} height={.18} color={accent} position={[.9, 1.22, .19]} />
    <Plant position={[-.93, 1.13, -.23]} scale={.34} />
    <Box size={[.33, .035, .42]} color={accent} position={[-.77, 1.16, .28]} rotation={[0, .15, 0]} />
    <Box size={[.78, .15, .68]} color={accent} position={[0, .65, 1.04]} radius={.11} />
    <Box size={[.77, .72, .13]} color={accent} position={[0, .97, 1.39]} radius={.1} />
    <Cylinder radius={.055} height={.5} color="#6d6870" position={[0, .32, 1.04]} />
    <Box size={[.65, .08, .08]} color="#6d6870" position={[0, .09, 1.04]} />
    <Box size={[.08, .08, .6]} color="#6d6870" position={[0, .09, 1.04]} />
  </group>;
});
export const Shelf = memo(function Shelf({ position, accent }: { position: [number, number, number]; accent: string }) {
  return <group position={position}>
    <Box size={[2.1, 1.6, .48]} color="#b59175" position={[0, .8, 0]} />
    <Box size={[1.88, 1.37, .05]} color="#ddc2a4" position={[0, .82, .26]} />
    {[.2, .75, 1.35].map(y => <Box key={y} size={[2.16, .08, .61]} color="#c5a184" position={[0, y, .08]} />)}
    {Array.from({ length: 7 }, (_, i) => <Box key={i} size={[.13, .3 + (i % 3) * .06, .28]} color={['#b5b2ce', '#e4d5b9', accent, '#799689'][i % 4]} position={[-.77 + i * .19, .98, .14]} rotation={[0, 0, i === 5 ? .13 : 0]} />)}
    <Box size={[.66, .36, .37]} color="#e5d4c0" position={[.37, .42, .14]} />
    <Plant position={[.54, 1.4, .08]} scale={.5} />
  </group>;
});
export const Lamp = memo(function Lamp({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <Cylinder radius={.27} height={.08} color="#948478" position={[0, .08, 0]} />
    <Cylinder radius={.04} height={2.15} color="#a08b76" position={[0, 1.1, 0]} />
    <mesh position={[0, 2.18, 0]} castShadow><cylinderGeometry args={[.31, .46, .43, 16]} /><meshStandardMaterial color="#ffedc7" emissive="#f5be71" emissiveIntensity={.2} /></mesh>
  </group>;
});
export function Sofa({ position, color = '#c99d7f' }: { position: [number, number, number]; color?: string }) {
  return <group position={position}>
    <Box size={[2.75, .49, .97]} color={color} position={[0, .45, 0]} radius={.16} />
    <Box size={[2.8, .87, .25]} color={color} position={[0, .83, -.47]} radius={.12} />
    {[-1.3, 1.3].map(x => <Box key={x} size={[.29, .72, 1.13]} color={color} position={[x, .63, 0]} radius={.12} />)}
    {[-.62, .62].map(x => <Box key={x} size={[.56, .46, .2]} color="#f4dfbd" position={[x, .98, -.27]} rotation={[0, 0, x * .2]} radius={.1} />)}
  </group>;
}
export const WallArt = memo(function WallArt({ theme }: { theme: 'studio' | 'lab' | 'garden' }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 320;
    const c = canvas.getContext('2d')!;
    c.fillStyle = theme === 'lab' ? '#233c39' : theme === 'studio' ? '#ece0cf' : '#f1d784'; c.fillRect(0,0,512,320);
    if (theme === 'studio') {
      c.fillStyle='#8e66b9';c.beginPath();c.arc(256,126,73,0,Math.PI*2);c.fill();
      c.strokeStyle='#bd9c5b';c.lineWidth=9;c.beginPath();c.ellipse(256,126,119,35,-.3,0,Math.PI*2);c.stroke();
      c.fillStyle='#4a3859';c.font='bold 31px sans-serif';c.textAlign='center';c.fillText('MAKE SPACE FOR IDEAS',256,267);
    } else if(theme==='lab') {
      const dots=[[100,100],[250,65],[395,120],[190,190],[370,210]];
      c.strokeStyle='#709e8c';c.lineWidth=4;
      for(let i=1;i<dots.length;i++){c.beginPath();c.moveTo(...dots[i-1] as [number,number]);c.lineTo(...dots[i] as [number,number]);c.stroke();}
      for(const [x,y] of dots){c.fillStyle='#94c4a8';c.fillRect(x-18,y-14,36,28);}
      c.fillStyle='#d8e9c2';c.font='bold 27px monospace';c.textAlign='center';c.fillText('small pieces. big systems.',256,280);
    } else {
      for(let i=0;i<8;i++){const a=i*Math.PI/4;c.fillStyle=i%2?'#d47c53':'#d7954f';c.beginPath();c.ellipse(256+Math.cos(a)*54,128+Math.sin(a)*54,27,41,a+Math.PI/2,0,Math.PI*2);c.fill();}
      c.fillStyle='#715840';c.beginPath();c.arc(256,128,30,0,Math.PI*2);c.fill();c.font='bold 31px sans-serif';c.textAlign='center';c.fillText('GOOD THINGS TAKE TIME',256,278);
    }
    return new CanvasTexture(canvas);
  },[theme]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={[.18,1.75,-3.39]}><planeGeometry args={[1.28,.76]}/><meshStandardMaterial map={texture} roughness={1}/></mesh>;
});
export function CoffeeSteam({ position, paused }: { position: [number,number,number]; paused: boolean }) {
  const group=useRef<Group>(null), time=useRef(0);
  useFrame((_,dt)=>{if(paused||!group.current)return;time.current+=Math.min(dt,.05);group.current.children.forEach((p,i)=>{const phase=(time.current*.45+i*.25)%1;p.position.y=phase*.7;p.position.x=Math.sin(time.current*1.7+i)*.05;p.scale.setScalar(.3+phase*.8);});});
  return <group ref={group} position={position}>{[0,1,2].map(i=><mesh key={i}><sphereGeometry args={[.085,8,6]}/><meshBasicMaterial color="#fff7dc" transparent opacity={.14} depthWrite={false}/></mesh>)}</group>;
}
