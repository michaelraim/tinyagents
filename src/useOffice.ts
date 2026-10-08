import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent, emptyOffice, type OfficeState } from '../shared/protocol';
import { createDemo, nextDemoEvent, growDemo } from './demo';
import type { PublicOffice } from '../shared/public-office';
import type { GameAction, GameState } from '../shared/game';
import { useAccount } from './AccountContext';
import { recordDiagnostic, recordSnapshot } from './diagnostics';
const initialVisit = () => new URLSearchParams(location.search).get('visit') ?? '';
function visitUrl(id = '', path = '/office') { const url = new URL(location.href); url.pathname=path; id ? url.searchParams.set('visit', id) : url.searchParams.delete('visit'); history.pushState({}, '', url); }
function saved(key: string) { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private browsing may disable storage. */ } }
export function useOffice() {
  const account = useAccount();
  const [officeId, setOfficeId] = useState(() => saved('sidequest.office'));
  const [visitId, setVisitId] = useState(initialVisit);
  const [mode, setMode] = useState<'demo' | 'live' | 'visit'>(() => initialVisit() ? 'visit' : (location.pathname==='/demo'||location.pathname==='/world') ? 'demo' : 'live');
  const [office, setOffice] = useState(() => mode !== 'demo' ? emptyOffice() : createDemo());
  const [publicView, setPublicView] = useState<PublicOffice>();
  const [connection, setConnection] = useState(mode !== 'demo' ? 'Connecting…' : 'Demo office');
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [paused, setPaused] = useState(false);
  // A connected office keeps its game economy in Cloudflare; it arrives with each snapshot.
  const [serverGame, setServerGame] = useState<GameState>();
  const [now, setNow] = useState(Date.now);
  const tick = useRef(0);
  useEffect(() => {
    if (account.loading || !account.user) return;
    setOfficeId(account.officeId ?? '');
    remember('sidequest.office', account.officeId ?? '');
  }, [account.loading, account.user, account.officeId]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (mode !== 'demo' || paused) return;
    const id = setInterval(() => setOffice(o => applyEvent(o, nextDemoEvent(o, tick.current++))), 3000);
    return () => clearInterval(id);
  }, [mode, paused]);
  useEffect(() => {
    const id = mode === 'visit' ? visitId : account.user ? account.officeId : officeId;
    if (mode === 'demo' || !id || (mode === 'live' && account.loading)) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>, socket: WebSocket | undefined, retries = 0;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let pongAt = Date.now();
    const controller = new AbortController();
    const retry = () => {
      if (stopped) return;
      clearInterval(heartbeat);
      setConnection('Connection lost · retrying');
      recordDiagnostic('feed.retry');
      timer = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(retries++, 5)));
    };
    const connect = async () => {
      setConnection(retries ? 'Reconnecting…' : 'Connecting…');
      recordDiagnostic('feed.connecting');
      try {
        // An HTTP check distinguishes an expired login from a transient socket failure.
        const response = await fetch(`/api/${mode === 'visit' ? 'public' : 'snapshot'}?office=${encodeURIComponent(id)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (stopped) return;
        if (response.status === 401 || response.status === 404) { setOffice(emptyOffice()); setPublicView(undefined); setConnection(mode === 'visit' ? 'This office is private or its link was closed' : 'Sign in · Connect agents'); return; }
        if (!response.ok) throw new Error('Unavailable');
        const snapshot = await response.json();
        if (stopped) return;
        setOffice(mode === 'visit' ? snapshot.office : snapshot);
        recordSnapshot(mode === 'visit' ? snapshot.office : snapshot);
        if (mode === 'visit') setPublicView(snapshot);
        socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/${mode === 'visit' ? 'public/' : ''}stream?office=${encodeURIComponent(id)}`);
        socket.onopen = () => {
          if (stopped) { socket?.close(); return; }
          retries = 0; pongAt = Date.now(); setConnection('Live view');
          recordDiagnostic('feed.open');
          socket?.send('ping');
          heartbeat = setInterval(() => {
            if (Date.now() - pongAt > 70_000) { socket?.close(); return; }
            if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
          }, 25_000);
        };
        socket.onmessage = e => {
          if (stopped) return;
          pongAt = Date.now();
          if (e.data === 'pong') return;
          try {
            const message = JSON.parse(e.data);
            if (message.type === 'session_ended') { stopped = true; clearInterval(heartbeat); setOffice(emptyOffice()); setPublicView(undefined); setConnection('Sign in · Connect agents'); socket?.close(); return; }
            if (message.type === 'sharing_changed' && mode === 'visit') { setOffice(emptyOffice()); setPublicView(undefined); socket?.close(); return; }
            if (message.type === 'snapshot') { recordSnapshot(message.office);setOffice(message.office as OfficeState); if (mode === 'visit') setPublicView(message); else if (message.game) setServerGame(message.game as GameState); }
          } catch { recordDiagnostic('feed.unreadable');setConnection('Unreadable update'); }
        };
        socket.onclose = () => { if (stopped) return; if (mode === 'visit') { setOffice(emptyOffice()); setPublicView(undefined); } retry(); };
        socket.onerror = () => socket?.close();
      } catch { retry(); }
    };
    void connect();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); clearInterval(heartbeat); socket?.close(); };
  }, [mode, officeId, visitId, sessionEpoch, account.loading, account.user, account.officeId]);
  const enterLive = useCallback((id: string) => {
    visitUrl(); setVisitId(''); setPublicView(undefined);
    setOffice(emptyOffice()); setOfficeId(id); remember('sidequest.office', id); remember('sidequest.mode', 'live');
    setMode('live'); setPaused(false); setSessionEpoch(value => value + 1);
  }, []);
  const enterDemo = useCallback(() => { visitUrl('', '/demo'); setVisitId(''); setPublicView(undefined); setOffice(createDemo()); setMode('demo'); remember('sidequest.mode', 'demo'); setConnection('Demo office'); setPaused(false); }, []);
  const visit = useCallback((id: string) => { visitUrl(id); setVisitId(id); setMode('visit'); setOffice(emptyOffice()); setPublicView(undefined); setPaused(false); setSessionEpoch(v => v + 1); }, []);
  useEffect(() => { const back = () => { const id = initialVisit(); setVisitId(id); const demo=location.pathname==='/demo';setMode(id ? 'visit' : demo ? 'demo':'live'); setOffice(!id && demo ? createDemo():emptyOffice()); setPublicView(undefined); }; window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, [officeId]);
  const forgetOffice = useCallback(() => { setOfficeId(''); remember('sidequest.office', ''); enterDemo(); }, [enterDemo]);
  const addDemo=useCallback((kind:'project'|'session'|'agent')=>setOffice(current=>growDemo(current,kind)),[]);
  const liveId = mode === 'live' ? (account.user ? account.officeId : officeId) : '';
  /** Spend coins on the server; resolves to the office's new game, or null if refused. */
  const postGame = useCallback(async (action: GameAction): Promise<GameState | null> => {
    if (!liveId) return null;
    try {
      const response = await fetch(`/api/game?office=${encodeURIComponent(liveId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action), signal: AbortSignal.timeout(8000) });
      const body = await response.json() as GameState & { game?: GameState };
      if (!response.ok) { if (body.game) setServerGame(body.game); return null; }
      setServerGame(body);
      return body;
    } catch { return null; }
  }, [liveId]);
  useEffect(() => { if (mode !== 'live') setServerGame(undefined); }, [mode]);
  return { office, mode, connection, paused, setPaused, now, enterLive, enterDemo, forgetOffice, officeId, visit, visitId, publicView, addDemo, serverGame: mode === 'live' ? serverGame : undefined, postGame };
}
