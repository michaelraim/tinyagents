import { useEffect, useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import Modal, { Tabs } from './Modal';
import { localTimeZone } from '../shared/clock';
type Keys = { officeId: string; ingestKey: string; viewerKey: string; ownerKey: string };
type Health = { publicSignup: boolean; storage: string; registration: boolean };
function savedOffice() { try { return localStorage.getItem('sidequest.office') ?? ''; } catch { return ''; } }
export default function ConnectDialog({ onClose, onConnect, onDeleted, initialTab }: { onClose: () => void; onConnect: (id: string) => void; onDeleted: (id: string) => void; initialTab?: 'new'|'existing' }) {
  const [keys, setKeys] = useState<Keys>();
  const [tab, setTab] = useState<'new' | 'existing' | 'manage'>(() => initialTab ?? (savedOffice() ? 'existing' : 'new'));
  const [health, setHealth] = useState<Health>();
  const [invite, setInvite] = useState(''), [officeId, setOfficeId] = useState(savedOffice), [viewerKey, setViewerKey] = useState(''), [ownerKey, setOwnerKey] = useState('');
  const [confirmation, setConfirmation] = useState(''), [savedRecovery, setSavedRecovery] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setHealth)
      .catch(() => { if (!controller.signal.aborted) setError('The office service is unavailable. Close this window and try again shortly.'); });
    return () => controller.abort();
  }, []);
  function close() {
    if (keys && !savedRecovery) { setError('Save your recovery file first. It is the only way to recover or delete your office.'); return; }
    onClose();
  }
  async function connect() {
    setBusy(true); setError('');
    try {
      const response = await fetch(tab === 'new' ? '/api/offices' : '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tab === 'new' ? { invite, timeZone:localTimeZone() } : { officeId: officeId.trim(), viewerKey: viewerKey.trim() }), signal: AbortSignal.timeout(15000) });
      const result = await response.json().catch(() => ({ error: 'The office service is unavailable. Try again shortly.' }));
      if (!response.ok) throw new Error(result.error || 'Could not connect. Check your office key.');
      if (tab === 'new') { setKeys(result); setSavedRecovery(false); onConnect(result.officeId); }
      else { onConnect(officeId.trim()); onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the office.'); }
    finally { setBusy(false); }
  }
  async function manage(remove: boolean) {
    if (remove && confirmation !== 'DELETE') return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/${remove ? 'office' : 'keys'}?office=${encodeURIComponent(officeId.trim())}`, {
        method: remove ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${ownerKey.trim()}` }, signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update your office.');
      if (remove) { onDeleted(officeId.trim()); onClose(); }
      else { setKeys(result); setSavedRecovery(false); onConnect(result.officeId); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the office.'); }
    finally { setBusy(false); }
  }
  function downloadConfig(recovery = false) {
    if (!keys) return;
    const content = JSON.stringify(recovery
      ? { url: location.origin, officeId: keys.officeId, viewerKey: keys.viewerKey, ownerKey: keys.ownerKey }
      : { endpoint: `${location.origin}/api/events`, officeId: keys.officeId, ingestKey: keys.ingestKey, projectName: '', projectId: '', theme: 'studio' }, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = recovery ? 'tinyagents.recovery.json' : 'tinyagents.config.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (recovery) { setSavedRecovery(true); setError(''); }
  }
  async function importRecovery(file?: File) {
    if (!file) return;
    try {
      if (file.size > 16384) throw new Error();
      const data = JSON.parse(await file.text());
      if (typeof data.officeId !== 'string' || typeof data.viewerKey !== 'string') throw new Error();
      if (data.url && data.url !== location.origin) { setError('This recovery file belongs to a different website. Open the URL written in that file.'); return; }
      setOfficeId(data.officeId); setViewerKey(data.viewerKey); setOwnerKey(typeof data.ownerKey === 'string' ? data.ownerKey : ''); setError('');
    } catch { setError('Choose the recovery JSON file downloaded when you created your office.'); }
  }
  const needsInvite = health && !health.publicSignup && health.storage !== 'local';
  const canCreate = health?.publicSignup || health?.storage === 'local';
  const foot = <p className="ui-note"><a href="/setup.html" target="_blank" rel="noreferrer">Setup guide ↗</a> · <a href="/privacy.html" target="_blank" rel="noreferrer">What we store ↗</a> · Only activity metadata leaves your machine.</p>;
  const alert = error && <p className="ui-alert" role="alert">{error}</p>;
  if (keys) return <Modal eyebrow="Make yourself at home" title="Your office is ready" onClose={close} foot={<><button className="ui-btn primary full big" disabled={!savedRecovery} onClick={onClose}>Step into my office <ArrowRight size={16} /></button>{foot}</>}>
    <ol className="ui-steps">
      <li><div><strong>Save your recovery file</strong><p>Keep it private. It opens your office and lets you replace keys or delete it. There is no email reset.</p><div className="ui-row"><button className="ui-btn small" onClick={() => downloadConfig(true)}><Download size={14} /> {savedRecovery ? 'Saved ✓' : 'Recovery file'}</button></div></div></li>
      <li><div><strong>Pair your computer</strong><p>Use this file with the setup command in the guide. Codex and Claude Code share it.</p><div className="ui-row"><button className="ui-btn small" onClick={() => downloadConfig()}><Download size={14} /> Connection file</button></div></div></li>
      <li><div><strong>Add the observer</strong><p>The guide has the install commands. Prefer a ZIP? Each includes instructions.</p><div className="ui-row"><a className="ui-btn small" href="/plugins/codex.zip" download><Download size={14} /> Codex</a><a className="ui-btn small" href="/plugins/claude.zip" download><Download size={14} /> Claude Code</a></div></div></li>
    </ol>
    {alert}
  </Modal>;
  return <Modal eyebrow="Make yourself at home" title="Bring your agents in" onClose={close} foot={foot}
    tabs={<Tabs label="Office options" value={tab} onChange={t => { setTab(t); setError(''); }} options={[...(canCreate ? [['new', 'New office'] as ['new', string]] : []), ['existing', 'Open office'], ['manage', 'Manage']]} />}>
    {tab === 'manage' ? <>
      <p>Use your recovery file to replace keys or delete your office. A viewer key can’t do this.</p>
      <label className="ui-field">Recovery file<input type="file" accept=".json,application/json" onChange={e => void importRecovery(e.target.files?.[0])} /></label>
      <div className="ui-fields-2"><label className="ui-field">Office ID<input value={officeId} onChange={e => setOfficeId(e.target.value)} /></label>
        <label className="ui-field">Recovery key<input value={ownerKey} onChange={e => setOwnerKey(e.target.value)} type="password" autoComplete="off" /></label></div>
      <p className="ui-note">Replacing keys stops all old connections. Download the new files and pair your computers again.</p>
      <button className="ui-btn full" disabled={busy || !officeId || !ownerKey} onClick={() => void manage(false)}>Replace all keys</button>
      <section className="ui-card danger"><h3>Delete this office</h3><p>Permanently removes its activity and keys. Your code isn’t touched.</p>
        <label className="ui-field">Type DELETE to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>
        <button className="ui-btn danger full" disabled={busy || !officeId || !ownerKey || confirmation !== 'DELETE'} onClick={() => void manage(true)}>Delete office permanently</button></section>
      {alert}
    </> : <form className="ui-stack" onSubmit={e => { e.preventDefault(); void connect(); }}>
      {tab === 'new' ? <>
        <p>Anyone can have a little office. It starts private; connect Codex, Claude Code, or both.</p>
        {needsInvite ? <label className="ui-field">Invite code<input value={invite} onChange={e => setInvite(e.target.value)} placeholder="Enter your invite" required type="password" autoComplete="off" /></label>
          : <p className="ui-note">No invite or password needed. Save your recovery file to keep access.</p>}
        <p className="ui-note">☀️ Office clock: {localTimeZone().replaceAll('_', ' ')}. Day and night follow it.</p>
      </> : <>
        <label className="ui-field">Recovery file <small>fills in the fields for you</small><input type="file" accept=".json,application/json" onChange={e => void importRecovery(e.target.files?.[0])} /></label>
        <div className="ui-fields-2"><label className="ui-field">Office ID<input value={officeId} onChange={e => setOfficeId(e.target.value)} required /></label>
          <label className="ui-field">Viewer or recovery key<input value={viewerKey} onChange={e => setViewerKey(e.target.value)} type="password" required autoComplete="off" /></label></div>
      </>}
      {alert}
      <button className="ui-btn primary full big" disabled={busy || (tab === 'new' && (!health || !health.registration))}>{busy ? 'Making room…' : tab === 'new' ? 'Create my office' : 'Open my office'}<ArrowRight size={16} /></button>
    </form>}
  </Modal>;
}
