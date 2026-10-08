import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3 } from 'three';

/** Small screen-space labels. Defer secondary-root cleanup until React's current
 * commit finishes; frequent speech-bubble changes must not unmount another root
 * synchronously during the scene's own render. */
export function WorldHtml({children,position=[0,0,0],center=false,style,zIndexRange=[20,0]}:{children:ReactNode;position?:[number,number,number];center?:boolean;style?:CSSProperties;zIndexRange?:[number,number]}){
  const {gl,camera,size}=useThree(),group=useRef<Group>(null),point=useRef(new Vector3());
  const [element]=useState(()=>document.createElement('div')),root=useRef<Root|null>(null);
  useEffect(()=>{
    element.style.cssText='position:absolute;left:0;top:0;pointer-events:none;';
    gl.domElement.parentElement?.appendChild(element);const mounted=createRoot(element);root.current=mounted;
    return()=>{element.remove();root.current=null;queueMicrotask(()=>mounted.unmount());};
  },[element,gl]);
  useEffect(()=>{root.current?.render(<div style={{transform:center?'translate(-50%,-50%)':undefined,pointerEvents:'auto',...style}}>{children}</div>);});
  useFrame(()=>{
    if(!group.current)return;group.current.getWorldPosition(point.current);const distance=point.current.distanceTo(camera.position);point.current.project(camera);
    element.style.display=Math.abs(point.current.z)>1?'none':'';
    element.style.transform=`translate3d(${(point.current.x+1)*size.width/2}px,${(1-point.current.y)*size.height/2}px,0)`;
    element.style.zIndex=String(Math.round(zIndexRange[0]+(zIndexRange[1]-zIndexRange[0])*Math.min(1,distance/camera.far)));
  });
  return <group ref={group} position={position}/>;
}
