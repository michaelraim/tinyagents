import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Plug, X } from 'lucide-react';
import { localTimeZone } from '../shared/clock';
type Keys = { officeId: string; ingestKey: string; viewerKey: string; ownerKey: string };
type Health = { publicSignup: boolean; storage: string; registration: boolean };
function savedOffice() { try { return localStorage.getItem('sidequest.office') ?? ''; } catch { return ''; } }
export default function ConnectDialog({ onClose, onConnect, onDeleted, initialTab }: { onClose: () => void; onConnect: (id: string) => void; onDeleted: (id: string) => void; initialTab?: 'new'|'existing' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keys, setKeys] = useState<Keys>();
  const [tab, setTab] = useState<'new' | 'existing' | 'manage'>(() => initialTab ?? (savedOffice() ? 'existing' : 'new'));
  const [health, setHealth] = useState<Health>();
  const [invite, setInvite] = useState(''), [officeId, setOfficeId] = useState(savedOffice), [viewerKey, setViewerKey] = useState(''), [ownerKey, setOwnerKey] = useState('');
  const [confirmation, setConfirmation] = useState(''), [savedRecovery, setSavedRecovery] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
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
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = recovery ? 'sidequest.recovery.json' : 'sidequest.config.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
  return <dialog ref={dialog} className="connect-dialog" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
    <button className="icon-button close-dialog" onClick={close} aria-label="Close connection setup"><X size={18} /></button>
    <div className="dialog-icon"><Plug size={24} /></div>
    <p className="eyebrow">MAKE YOURSELF AT HOME</p><h2>Bring your agents in.</h2>
    {!keys ? <>
      {tab==='new'&&<p className="muted">☀️ Office time zone: {localTimeZone().replaceAll('_',' ')}. Day and night will follow this clock.</p>}
      <p className="muted">Anyone can have a little office. Your office starts private. Connect Codex, Claude Code, or both.</p>
      <div className="segmented">
        <button className={tab === 'new' ? 'active' : ''} onClick={() => { setTab('new'); setError(''); }}>New office</button>
        <button className={tab === 'existing' ? 'active' : ''} onClick={() => { setTab('existing'); setError(''); }}>Open office</button>
        <button className={tab === 'manage' ? 'active' : ''} onClick={() => { setTab('manage'); setError(''); }}>Manage</button>
      </div>
      {tab === 'manage' ? <>
        <p className="muted">Use your recovery file to replace keys or delete your office. A viewer key cannot make these changes.</p>
        <label>Recovery file<input type="file" accept=".json,application/json" onChange={e => void importRecovery(e.target.files?.[0])} /></label>
        <label>Office ID<input value={officeId} onChange={e => setOfficeId(e.target.value)} /></label>
        <label>Recovery key<input value={ownerKey} onChange={e => setOwnerKey(e.target.value)} type="password" autoComplete="off" /></label>
        <p className="muted">Replacing keys stops all old connections. Download the new files and pair your coding clients again.</p>
        <button className="secondary full" disabled={busy || !officeId || !ownerKey} onClick={() => void manage(false)}>Replace all keys</button>
        <details className="delete-office"><summary>Delete this office</summary><p>This permanently removes its activity and keys. It does not change your coding projects.</p><label>Type DELETE to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button className="secondary full" disabled={busy || !officeId || !ownerKey || confirmation !== 'DELETE'} onClick={() => void manage(true)}>Delete office permanently</button></details>
        {error && <p className="form-error" role="alert">{error}</p>}
      </> : <form onSubmit={e => { e.preventDefault(); void connect(); }}>
        {tab === 'new' ? needsInvite ? <label>Invite code<input value={invite} onChange={e => setInvite(e.target.value)} placeholder="Enter your invite" required type="password" autoComplete="off" /></label> : <p className="muted">No invite or coding account password needed. Save your recovery file to keep access.</p> : <>
          <label>Recovery file <span className="muted">· fill the fields for me</span><input type="file" accept=".json,application/json" onChange={e => void importRecovery(e.target.files?.[0])} /></label>
          <label>Office ID<input value={officeId} onChange={e => setOfficeId(e.target.value)} required /></label>
          <label>Viewer or recovery key<input value={viewerKey} onChange={e => setViewerKey(e.target.value)} type="password" required autoComplete="off" /></label>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary full" disabled={busy || (tab === 'new' && (!health || !health.registration))}>{busy ? 'Making room…' : tab === 'new' ? 'Create my office' : 'Open my office'}<ArrowRight size={16} /></button>
      </form>}
      <div className="privacy-note"><span>⌁</span><p>Only activity metadata leaves your machine. Prompts, source code, command arguments, and tool output stay local.</p></div>
    </> : <>
      <p className="muted">Your office is ready. Save both files, then follow the short setup guide.</p>
      <div className="setup-step"><b>1</b><div><strong>Save your recovery file</strong><p>Keep this private. It opens your office and lets you replace keys or delete it. There is no email reset.</p><button className="secondary" onClick={() => downloadConfig(true)}><Download size={15} /> {savedRecovery ? 'Recovery file saved ✓' : 'Recovery file'}</button></div></div>
      <div className="setup-step"><b>2</b><div><strong>Pair your computer</strong><p>Use this file with the setup command in the guide. Codex and Claude share the same connection.</p><button className="secondary" onClick={() => downloadConfig()}><Download size={15} /> Connection file</button></div></div>
      <div className="setup-step"><b>3</b><div><strong>Add the observer</strong><p>The guide has the install commands for both clients. Prefer a ZIP? Each one includes instructions.</p><div className="button-row"><a className="secondary" href="/plugins/codex.zip" download><Download size={14} /> Codex</a><a className="secondary" href="/plugins/claude.zip" download><Download size={14} /> Claude Code</a></div></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary full" disabled={!savedRecovery} onClick={onClose}>Step into my office <ArrowRight size={16} /></button>
    </>}
    <p className="muted"><a href="/setup.html" target="_blank" rel="noreferrer">Simple setup guide ↗</a> · <a href="/privacy.html" target="_blank" rel="noreferrer">What we store ↗</a></p>
  </dialog>;
}
