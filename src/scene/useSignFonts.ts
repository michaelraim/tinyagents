import { useEffect, useState } from 'react';

let loaded:Promise<unknown>|undefined;
/** Repaint canvas lettering once the site's local fonts arrive. */
export function useSignFonts(){
  const [ready,setReady]=useState(()=>document.fonts.check('600 16px Fredoka')&&document.fonts.check('700 16px "Nunito Sans"'));
  useEffect(()=>{
    if(ready)return;
    let active=true;
    loaded??=Promise.all([document.fonts.load('600 16px Fredoka'),document.fonts.load('700 16px "Nunito Sans"')]);
    void loaded.then(()=>{if(active)setReady(true);}).catch(()=>{/* Native fallback fonts keep every label legible. */});
    return()=>{active=false;};
  },[ready]);
  return ready;
}
