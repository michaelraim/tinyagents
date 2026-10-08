import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Group, SRGBColorSpace, Vector3 } from 'three';
import { Box } from './Props';

function canvasTexture(width:number,height:number,paint:(ctx:CanvasRenderingContext2D)=>void){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d')!);const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}

/** Actual scene geometry: a painted timber sign, cantilevered from its post.
 * Only the board turns towards the camera, like a tycoon game's world markers.
 * Its anchor and projection are handled by Three in the same draw as the room. */
export function ProjectSign({name,subtitle,mark,color,position,onClick}:{name:string;subtitle:string;mark:string;color:string;position:[number,number,number];onClick:()=>void}){
  const board=useRef<Group>(null),direction=useRef(new Vector3()),{camera}=useThree();
  useFrame(()=>{if(board.current){camera.getWorldDirection(direction.current);board.current.rotation.y=Math.atan2(-direction.current.x,-direction.current.z);}});
  const texture=useMemo(()=>canvasTexture(1024,288,ctx=>{
    ctx.fillStyle='#344e43';ctx.fillRect(0,0,1024,288);
    ctx.strokeStyle='#8ba185';ctx.lineWidth=5;ctx.strokeRect(14,14,996,260);
    ctx.fillStyle=color;ctx.fillRect(27,28,117,230);
    ctx.fillStyle='#fff5d7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 74px Manrope, sans-serif';ctx.fillText(mark,85,135);
    ctx.textAlign='left';ctx.font='800 93px Manrope, sans-serif';ctx.fillText(name,176,116,798);
    ctx.fillStyle='#d0dcb4';ctx.font='600 40px Manrope, sans-serif';ctx.fillText(subtitle.toUpperCase(),180,220,780);
    ctx.fillStyle='#fff4cd';for(const [x,y] of [[17,17],[1007,17],[17,271],[1007,271]]){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
  }),[name,subtitle,mark,color]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <group position={position} onClick={e=>{e.stopPropagation();onClick();}} onPointerOver={()=>{document.body.style.cursor='pointer';}} onPointerOut={()=>{document.body.style.cursor='auto';}}>
    <Box size={[.24,3.7,.24]} color="#65735a" position={[0,1.85,0]}/><Box size={[.9,.14,.8]} color="#cbbd96" position={[0,.16,0]}/>
    <group ref={board} position={[0,3.8,0]}>
      <Box size={[8.8,2.56,.24]} color="#b49a73" position={[0,0,0]}/><Box size={[9,.18,.38]} color="#6b7254" position={[0,1.36,0]}/>
      <mesh position={[0,0,.131]}><planeGeometry args={[8.45,2.37]}/><meshStandardMaterial map={texture} roughness={1} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={.22}/></mesh>
    </group>
  </group>;
}

/** Native Three sprite attached to the character's scene graph, never a DOM
 * projection. Bubble size is in world units, so it belongs to the miniature. */
export function GameBubble({text,position=[0,2.65,0],compact=false,attention=false,nameplate=false}:{text:string;position?:[number,number,number];compact?:boolean;attention?:boolean;nameplate?:boolean}){
  const width=compact?256:640,height=compact?160:180;
  const texture=useMemo(()=>canvasTexture(width,height,ctx=>{
    ctx.shadowColor='#26372d55';ctx.shadowBlur=8;ctx.shadowOffsetY=6;
    ctx.fillStyle=nameplate?'#304b40':attention?'#ffe5a0':'#fff6db';ctx.strokeStyle=nameplate?'#e6d9af':'#baa982';ctx.lineWidth=5;
    ctx.beginPath();ctx.roundRect(8,8,width-16,height-43,compact?36:25);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    if(!nameplate){ctx.beginPath();ctx.moveTo(width/2-15,height-36);ctx.lineTo(width/2-3,height-10);ctx.lineTo(width/2+22,height-38);ctx.fill();}
    ctx.fillStyle=nameplate?'#fff0c7':'#4c5a3b';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`700 ${compact?83:72}px "Segoe UI Emoji", "Apple Color Emoji", Manrope, sans-serif`;ctx.fillText(text,width/2,(height-29)/2,width-45);
  }),[width,height,text,attention,nameplate,compact]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  const w=compact?2.1:nameplate?5.2:6.2;
  return <sprite position={position} scale={[w,w*height/width,1]} renderOrder={4}><spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false}/></sprite>;
}
