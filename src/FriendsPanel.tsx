import { useEffect, useState } from 'react';
import { ExternalLink, Link, X } from 'lucide-react';
import type { useFriends } from './useFriends';
import type { Designs } from './scene/OfficeScene';
import { privateSharing, type ShareSettings } from '../shared/public-office';
import { hangouts, VISITOR_LIMIT, type Hangout } from '../shared/neighborhood';
import { summarizeAgents } from '../shared/protocol';

export default function FriendsPanel({ accountOwned = false, book, officeId, visitId, onVisit, onHome, onConnect, onClose, neighborhoodOn, onNeighborhood, onHangout, designs, now }: {
  accountOwned?: boolean; book: ReturnType<typeof useFriends>; officeId: string; visitId: string; onVisit: (id: string) => void; onHome: () => void; onConnect: () => void; onClose: () => void;
  neighborhoodOn: boolean; onNeighborhood: (value: boolean) => void; onHangout: (kind: Hangout['kind']) => void; designs: Designs; now: number;
}) {
  const [link, setLink] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [key, setKey] = useState(''), [settings, setSettings] = useState<ShareSettings>(privateSharing), [loaded, setLoaded] = useState(false);
  useEffect(() => { if (accountOwned && officeId) void load(); }, [accountOwned, officeId]);
  async function loadRecovery(file?: File) {
    try {
      if (!file || file.size > 16384) throw new Error('Choose your office recovery file.');
      const data = JSON.parse(await file.text());
      if (data.officeId !== officeId || data.url !== location.origin || typeof data.ownerKey !== 'string') throw new Error('Choose the recovery file for your own office on this website.');
      setKey(data.ownerKey); await load(data.ownerKey);
    } catch (error) { setNotice((error as Error).message); }
  }
  async function load(owner = key) {
    setBusy(true); setNotice('');
    try { const res = await fetch(`/api/share?office=${officeId}`, { headers: { Authorization: `Bearer ${owner}` }, signal: AbortSignal.timeout(8000) }); if (!res.ok) throw new Error('Sign in again or use your owner recovery key to change sharing.'); setSettings(await res.json()); setLoaded(true); }
    catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function publish(enabled: boolean) {
    setBusy(true); setNotice('');
    try {
      const rooms = Object.fromEntries(Object.entries({...settings.rooms,...designs}).map(([id, room]) => [id, { ...room, description: room.description ?? '' }]));
      const res = await fetch(`/api/share?office=${officeId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ ...settings, rooms, enabled }), signal: AbortSignal.timeout(8000) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      setSettings(result); setNotice(enabled ? 'Visitor link is open. Only the information described below is public.' : 'Visitor link closed. New visits and updates are blocked.');
    } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
  }
  async function add(value = link) { setBusy(true); setNotice(''); try { await book.add(value); setLink(''); setNotice('Office saved. Pick Visit, or add it to your neighborhood.'); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } }
  const publicUrl = `${location.origin}/?visit=${officeId}`;
  return <section className="game-panel glass friends" aria-label="Friends and neighborhood">
    <div className="panel-heading"><div><small>THE HIGH-TECH NEIGHBORHOOD</small><h2>Friends & friendly rivals</h2></div><button onClick={onClose} aria-label="Close friends"><X size={18}/></button></div>
    <div className="friends-scroll">
      <p className="panel-intro">Follow a public office. Drop in for a visit. Invite its little people into your neighborhood.</p>
      {visitId && <div className="friend-visit-actions"><button onClick={() => void add(location.href)}>＋ Save this office</button><button onClick={onHome}>⌂ Back to my office</button></div>}
      <form className="friend-form" onSubmit={e => { e.preventDefault(); void add(); }}><label>Friend’s public office link<input type="url" required placeholder="https://…/?visit=…" value={link} onChange={e => setLink(e.target.value)}/></label><button className="primary" disabled={busy}>Add friend</button></form>
      <div className="friends-list">{book.friends.map(friend => {
        const state = book.states[friend.id], view = state?.view, counts = view ? summarizeAgents(view.office.agents, now) : null;
        return <article className="friend-card" key={friend.id}><div className="friend-avatar">{(view?.profile.name ?? friend.name).slice(0,1)}</div><div className="friend-details"><h3>{view?.profile.name ?? friend.name}</h3><p>{state?.error ?? (counts ? `${counts.running} working · ${counts.total} in office` : 'Checking the lights…')}</p>{view?.profile.bio && <small>{view.profile.bio}</small>}<div className="friend-controls"><button disabled={!view} onClick={() => onVisit(friend.id)}>Visit <ExternalLink size={12}/></button><label><input type="checkbox" checked={friend.included} disabled={!friend.included && book.friends.filter(f=>f.included).length >= 3} onChange={() => book.toggle(friend.id)}/> In my world</label><button aria-label={`Remove ${friend.name} from friends`} onClick={() => book.remove(friend.id)}><X size={13}/></button></div>{view && view.office.agents.length > VISITOR_LIMIT && <small>First {VISITOR_LIMIT} visitors in the neighborhood. Visit to see the full office.</small>}</div></article>;
      })}</div>
      {!book.friends.length && <div className="friends-empty">🏡 It’s quiet on your street.<small>Ask a friend to open Friends → Share my office and send you their visitor link.</small></div>}
      <div className="neighborhood-switch"><label><input type="checkbox" checked={neighborhoodOn} onChange={e => onNeighborhood(e.target.checked)}/> Show my neighborhood</label><p>Up to three friend offices share your café, arcade, and think tank. Their real status refreshes every 12 seconds.</p></div>
      <div className="hangout-grid">{Object.entries(hangouts).map(([kind, value]) => <button key={kind} disabled={!neighborhoodOn || !book.friends.some(f=>f.included && book.states[f.id]?.view)} onClick={() => onHangout(kind as Hangout['kind'])}><span>{value.icon}</span>{value.name}</button>)}</div>
      <p className="social-footnote">Hangouts happen in your view with characters between tasks. They never send messages to your friends, change work state, or control real agents. Friends are saved in this browser.</p>
      <details className="share-office"><summary><Link size={15}/> Share my office</summary>
        {!officeId ? <><p>Connect your own office first, then choose what visitors can see.</p><button className="primary" onClick={onConnect}>Connect my office</button></> : <>
          {!loaded && accountOwned ? <><p>Loading your sharing settings…</p><button disabled={busy} onClick={()=>void load()}>Try again</button></> : !loaded ? <><p>Your office is private by default. Load your recovery file to manage its visitor link.</p><label>Office recovery file<input type="file" accept=".json" onChange={e=>void loadRecovery(e.target.files?.[0])}/></label><label>Or recovery key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label><button className="primary" disabled={busy || !key} onClick={()=>void load()}>Load sharing settings</button></> : <>
            <label>Public office name<input maxLength={60} value={settings.name} onChange={e=>setSettings(v=>({...v,name:e.target.value}))}/></label>
            <label>Office motto<input maxLength={180} placeholder="Disrupting the coffee industry. From the inside." value={settings.bio} onChange={e=>setSettings(v=>({...v,bio:e.target.value}))}/></label>
            <label className="check-label"><input type="checkbox" checked={settings.projectNames} onChange={e=>setSettings(v=>({...v,projectNames:e.target.checked}))}/> Show project names and room descriptions</label>
            <p>Visitors see the office name, motto, character names, harnesses, hierarchy, room themes, and generic activity states. Project names stay anonymous unless enabled above. Task text, tool details, paths, keys, and private history are excluded.</p>
            <button className="primary" disabled={busy || !settings.name.trim()} onClick={()=>void publish(true)}>{settings.enabled ? 'Update public office' : 'Open visitor link'}</button>
            {settings.enabled && <><label>Public visitor link<input readOnly value={publicUrl} onFocus={e=>e.target.select()}/></label><button className="secondary" onClick={()=>{void navigator.clipboard.writeText(publicUrl).then(()=>setNotice('Visitor link copied.')).catch(()=>setNotice('Select and copy the visitor link above.'));}}>Copy link</button><button className="secondary" disabled={busy} onClick={()=>void publish(false)}>Close visitor link</button></>}
          </>}
        </>}
      </details>
      {notice && <p className="social-notice" role="status">{notice}</p>}
    </div>
  </section>;
}
