import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent, emptyOffice, type OfficeState } from '../shared/protocol';
import { createDemo, nextDemoEvent } from './demo';
function saved(key: string) { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private browsing may disable storage. */ } }
export function useOffice() {
  const [officeId, setOfficeId] = useState(() => saved('sidequest.office'));
  const [mode, setMode] = useState<'demo' | 'live'>(() => officeId && saved('sidequest.mode') !== 'demo' ? 'live' : 'demo');
  const [office, setOffice] = useState(() => mode === 'live' ? emptyOffice() : createDemo());
  const [connection, setConnection] = useState(mode === 'live' ? 'Connecting…' : 'Demo office');
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now);
  const tick = useRef(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (mode !== 'demo' || paused) return;
    const id = setInterval(() => setOffice(o => applyEvent(o, nextDemoEvent(o, tick.current++))), 3000);
    return () => clearInterval(id);
  }, [mode, paused]);
  useEffect(() => {
    if (mode !== 'live' || !officeId) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>, socket: WebSocket | undefined, retries = 0;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let pongAt = Date.now();
    const controller = new AbortController();
    const retry = () => {
      if (stopped) return;
      clearInterval(heartbeat);
      setConnection('Connection lost · retrying');
      timer = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(retries++, 5)));
    };
    const connect = async () => {
      setConnection(retries ? 'Reconnecting…' : 'Connecting…');
      try {
        // An HTTP check distinguishes an expired login from a transient socket failure.
        const response = await fetch(`/api/snapshot?office=${encodeURIComponent(officeId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (stopped) return;
        if (response.status === 401 || response.status === 404) { setConnection('Sign in · Connect agents'); return; }
        if (!response.ok) throw new Error('Unavailable');
        const snapshot = await response.json() as OfficeState;
        if (stopped) return;
        setOffice(snapshot);
        socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/stream?office=${encodeURIComponent(officeId)}`);
        socket.onopen = () => {
          retries = 0; pongAt = Date.now(); setConnection('Connected');
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
            if (message.type === 'snapshot') setOffice(message.office as OfficeState);
          } catch { setConnection('Unreadable update'); }
        };
        socket.onclose = retry;
        socket.onerror = () => socket?.close();
      } catch { retry(); }
    };
    void connect();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); clearInterval(heartbeat); socket?.close(); };
  }, [mode, officeId, sessionEpoch]);
  const enterLive = useCallback((id: string) => {
    setOffice(emptyOffice()); setOfficeId(id); remember('sidequest.office', id); remember('sidequest.mode', 'live');
    setMode('live'); setPaused(false); setSessionEpoch(value => value + 1);
  }, []);
  const enterDemo = useCallback(() => { setOffice(createDemo()); setMode('demo'); remember('sidequest.mode', 'demo'); setConnection('Demo office'); setPaused(false); }, []);
  const forgetOffice = useCallback(() => { setOfficeId(''); remember('sidequest.office', ''); enterDemo(); }, [enterDemo]);
  return { office, mode, connection, paused, setPaused, now, enterLive, enterDemo, forgetOffice, officeId };
}
