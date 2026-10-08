import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useEffect, useState } from 'react';
import './styles.css';
import './tycoon.css';
import './campus.css';
import './brand-theme.css';
import { AccountProvider } from './AccountContext';
import './account.css';
const App=lazy(()=>import('./App'));
const Landing=lazy(()=>import('./Landing'));
const PairingPage=lazy(()=>import('./PairingPage'));
function Router(){
  const [url,setUrl]=useState(location.href);
  useEffect(()=>{const update=()=>setUrl(location.href);addEventListener('popstate',update);return()=>removeEventListener('popstate',update);},[]);
  const route=new URL(url),inOffice=route.pathname==='/office'||route.pathname==='/demo'||route.searchParams.has('visit');
  return <Suspense fallback={<div className="world-loading">Opening tinyAGENTS…</div>}>{route.pathname==='/connect'?<PairingPage/>:inOffice?<App/>:<Landing/>}</Suspense>;
}
createRoot(document.getElementById('root')!).render(<AccountProvider><Router /></AccountProvider>);
