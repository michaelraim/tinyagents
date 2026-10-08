import { useEffect, useState } from 'react';
import { ExternalLink, Link, X } from 'lucide-react';
import type { useFriends } from './useFriends';
type Designs = Record<string, { vertical: string; props: string[]; description?: string }>;
import { privateSharing, type ShareSettings } from '../shared/public-office';
import { VISITOR_LIMIT } from '../shared/neighborhood';
import { Tabs } from './Modal';
import { summarizeAgents } from '../shared/protocol';

export default function FriendsPanel({ accountOwned = false, book, officeId, visitId, onVisit, onHome, onConnect, onClose, neighborhoodOn, onNeighborhood, designs, now }: {
  accountOwned?: boolean; book: ReturnType<typeof useFriends>; officeId: string; visitId: string; onVisit: (id: string) => void; onHome: () => void; onConnect: () => void; onClose: () => void;
  neighborhoodOn: boolean; onNeighborhood: (value: boolean) => void; designs: Designs; now: number;
}) {
  const [tab, setTab] = useState<'friends' | 'share'>('friends');
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
  const shown = book.friends.filter(f => f.included).length;
  return <aside className="hud-side hud-panel ui ui-friends" aria-label="Friends">
    <header><h3>Friends</h3><button onClick={onClose} aria-label="Close friends"><X size={16}/></button></header>
    <div className="hud-side-body">
      <Tabs label="Friends sections" value={tab} onChange={setTab} options={[['friends', `Offices${book.friends.length ? ` · ${book.friends.length}` : ''}`], ['share', 'Share mine']]} />
      {tab === 'friends' ? <>
        {visitId && <div className="ui-row"><button className="ui-btn small" onClick={() => void add(location.href)}>＋ Save this office</button><button className="ui-btn small" onClick={onHome}>⌂ My office</button></div>}
        <form className="ui-stack" onSubmit={e => { e.preventDefault(); void add(); }}>
          <label className="ui-field">Friend’s visitor link<input type="url" required placeholder="https://…/?visit=…" value={link} onChange={e => setLink(e.target.value)}/></label>
          <button className="ui-btn primary full" disabled={busy}>Add friend</button>
        </form>
        {book.friends.length ? book.friends.map(friend => {
          const state = book.states[friend.id], view = state?.view, counts = view ? summarizeAgents(view.office.agents, now) : null;
          const name = view?.profile.name ?? friend.name;
          return <div className="ui-item" key={friend.id}>
            <span className="ui-avatar">{name.slice(0, 1).toUpperCase()}</span>
            <div><b>{name}</b><small>{state?.error ?? (counts ? `${counts.running} working · ${counts.total} in office` : 'Checking the lights…')}</small>
              <label className="ui-check"><input type="checkbox" checked={friend.included} disabled={!friend.included && shown >= 3} onChange={() => book.toggle(friend.id)}/> Cowork in my building</label></div>
            <div className="ui-row"><button className="ui-btn small" disabled={!view} onClick={() => onVisit(friend.id)} aria-label={`Visit ${name}`}><ExternalLink size={13}/></button>
              <button className="ui-btn danger small" onClick={() => book.remove(friend.id)} aria-label={`Remove ${name}`}><X size={13}/></button></div>
          </div>;
        }) : <div className="ui-empty"><b>🏡 Quiet street</b>Ask a friend to open Friends → Share mine and send you their visitor link.</div>}
        <label className="ui-check"><input type="checkbox" checked={neighborhoodOn} onChange={e => onNeighborhood(e.target.checked)}/> Show friends’ offices in my building</label>
        <p className="ui-note">Up to three friends rent rooms in your building and share the café and lounge. Their real status refreshes every 12 seconds. Friends are saved in this browser.{book.friends.some(f => (book.states[f.id]?.view?.office.agents.length ?? 0) > VISITOR_LIMIT) ? ` Only the first ${VISITOR_LIMIT} of their people come over.` : ''}</p>
      </> : !officeId ? <>
        <p>Connect your own office first, then choose what visitors can see.</p>
        <button className="ui-btn primary full" onClick={onConnect}>Connect my office</button>
      </> : !loaded && accountOwned ? <>
        <p>Loading your sharing settings…</p><button className="ui-btn small" disabled={busy} onClick={() => void load()}>Try again</button>
      </> : !loaded ? <>
        <p>Your office is private by default. Load your recovery file to manage its visitor link.</p>
        <label className="ui-field">Office recovery file<input type="file" accept=".json" onChange={e => void loadRecovery(e.target.files?.[0])}/></label>
        <label className="ui-field">Or recovery key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)}/></label>
        <button className="ui-btn primary full" disabled={busy || !key} onClick={() => void load()}>Load sharing settings</button>
      </> : <>
        <label className="ui-field">Public office name<input maxLength={60} value={settings.name} onChange={e => setSettings(v => ({ ...v, name: e.target.value }))}/></label>
        <label className="ui-field">Motto<input maxLength={180} placeholder="Disrupting the coffee industry. From the inside." value={settings.bio} onChange={e => setSettings(v => ({ ...v, bio: e.target.value }))}/></label>
        <label className="ui-check"><input type="checkbox" checked={settings.projectNames} onChange={e => setSettings(v => ({ ...v, projectNames: e.target.checked }))}/> Show project names</label>
        <p className="ui-note">Visitors see the office name, motto, character names, harnesses, teams, room themes and generic activity. Task text, tool details, paths, keys and history are never shared.</p>
        <button className="ui-btn primary full" disabled={busy || !settings.name.trim()} onClick={() => void publish(true)}>{settings.enabled ? 'Update public office' : 'Open visitor link'}</button>
        {settings.enabled && <>
          <label className="ui-field">Visitor link<input readOnly value={publicUrl} onFocus={e => e.target.select()}/></label>
          <div className="ui-row"><button className="ui-btn small" onClick={() => { void navigator.clipboard.writeText(publicUrl).then(() => setNotice('Visitor link copied.')).catch(() => setNotice('Select and copy the visitor link above.')); }}><Link size={13}/> Copy</button>
            <button className="ui-btn danger small" disabled={busy} onClick={() => void publish(false)}>Close link</button></div>
        </>}
      </>}
      {notice && <p className="ui-ok" role="status">{notice}</p>}
    </div>
  </aside>;
}
