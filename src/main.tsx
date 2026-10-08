import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useEffect, useState } from 'react';
import './styles.css';
import './tycoon.css';
import './campus.css';
import './brand-theme.css';
import { AccountProvider } from './AccountContext';
import './account.css';
import './world/world.css';
import './dialogs-neon.css';
const Landing=lazy(()=>import('./Landing'));
const PairingPage=lazy(()=>import('./PairingPage'));
const WorldApp=lazy(()=>import('./world/WorldApp'));
function Router(){
  const [url,setUrl]=useState(location.href);
  useEffect(()=>{const update=()=>setUrl(location.href);addEventListener('popstate',update);return()=>removeEventListener('popstate',update);},[]);
  const route=new URL(url),inOffice=route.pathname==='/office'||route.pathname==='/demo'||route.pathname==='/world'||route.searchParams.has('visit');
  return <Suspense fallback={<div className="world-loading">Opening tinyAGENTS…</div>}>{route.pathname==='/connect'?<PairingPage/>:inOffice?<WorldApp/>:<Landing/>}</Suspense>;
}
createRoot(document.getElementById('root')!).render(<AccountProvider><Router /></AccountProvider>);
