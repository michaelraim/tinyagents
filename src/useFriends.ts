import { useEffect, useState } from 'react';
import type { PublicOffice } from '../shared/public-office';
import { publicLinkId } from '../shared/neighborhood';
export type Friend = { id: string; name: string; included: boolean };
export type FriendState = { view?: PublicOffice; error?: string; at: number };
export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>(() => {
    try { return JSON.parse(localStorage.getItem('sidequest.friends') ?? '[]').filter((v: Friend) => typeof v.id === 'string' && /^[a-f0-9-]{36}$/.test(v.id) && typeof v.name === 'string').slice(0,12); } catch { return []; }
  });
  const [states, setStates] = useState<Record<string, FriendState>>({});
  const ids = friends.map(f => f.id).join(',');
  useEffect(() => { try { localStorage.setItem('sidequest.friends', JSON.stringify(friends)); } catch { /* Keep this session usable when storage is disabled. */ } }, [friends]);
  useEffect(() => {
    let stopped = false; const controller = new AbortController();
    const refresh = async () => {
      const entries = await Promise.all(ids.split(',').filter(Boolean).map(async id => {
        try {
          const res = await fetch(`/api/public?office=${id}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]) });
          if (!res.ok) return [id, { error: res.status === 404 ? 'Visitor link closed' : 'Temporarily unavailable', at: Date.now() }] as const;
          return [id, { view: await res.json() as PublicOffice, at: Date.now() }] as const;
        } catch { return [id, { error: 'Waiting for connection', at: Date.now() }] as const; }
      }));
      if (!stopped) setStates(Object.fromEntries(entries));
    };
    void refresh(); const timer = setInterval(() => void refresh(), 12000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [ids]);
  async function add(link: string) {
    const id = publicLinkId(link, location.origin);
    if (friends.length >= 12 && !friends.some(f => f.id === id)) throw new Error('Your address book has room for 12 offices.');
    const res = await fetch(`/api/public?office=${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('That office has not opened its visitor link. Ask its owner to publish it.');
    const view: PublicOffice = await res.json();
    setFriends(list => list.some(f => f.id === id) ? list : [...list, { id, name: view.profile.name, included: false }]);
    setStates(current => ({ ...current, [id]: { view, at: Date.now() } }));
  }
  function toggle(id: string) { setFriends(list => list.map(f => f.id === id ? { ...f, included: !f.included && list.filter(x => x.included).length < 3 } : f)); }
  function remove(id: string) { setFriends(list => list.filter(f => f.id !== id)); setStates(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))); }
  return { friends, states, add, toggle, remove };
}
