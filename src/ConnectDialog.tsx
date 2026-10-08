import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, Plug, X } from 'lucide-react';
type Keys = { officeId: string; ingestKey: string; viewerKey: string };
export default function ConnectDialog({ onClose, onConnect }: { onClose: () => void; onConnect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keys, setKeys] = useState<Keys>();
  const [tab, setTab] = useState<'new' | 'existing'>(() => localStorage.getItem('sidequest.office') ? 'existing' : 'new');
  const [hosted, setHosted] = useState(true);
  const [invite, setInvite] = useState(''), [officeId, setOfficeId] = useState(''), [viewerKey, setViewerKey] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { dialog.current?.showModal(); const controller = new AbortController(); void fetch('/api/health', { signal: controller.signal }).then(r => r.json()).then(info => setHosted(info.storage !== 'local')).catch(() => {}); return () => controller.abort(); }, []);
  async function connect() {
    setBusy(true); setError('');
    try {
      const response = await fetch(tab === 'new' ? '/api/offices' : '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tab === 'new' ? { invite } : { officeId: officeId.trim(), viewerKey: viewerKey.trim() }), signal: AbortSignal.timeout(15000) });
      const result = await response.json().catch(() => ({ error: 'The office API is unavailable. Check the deployment or start the local bridge.' }));
      if (!response.ok) throw new Error(result.error || 'Could not connect. Check your office key.');
      if (tab === 'new') { setKeys(result); onConnect(result.officeId); } else { onConnect(officeId.trim()); onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach the office bridge.'); }
    finally { setBusy(false); }
  }
  function downloadConfig(recovery = false) {
    if (!keys) return;
    const content = JSON.stringify(recovery ? { url: location.origin, officeId: keys.officeId, viewerKey: keys.viewerKey } : { endpoint: `${location.origin}/api/events`, officeId: keys.officeId, ingestKey: keys.ingestKey, projectName: '', projectId: '', theme: 'studio' }, null, 2);
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = recovery ? 'sidequest.recovery.json' : 'sidequest.config.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  return <dialog ref={dialog} className="connect-dialog" onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <button className="icon-button close-dialog" onClick={onClose} aria-label="Close connection setup"><X size={18} /></button>
    <div className="dialog-icon"><Plug size={24} /></div>
    <p className="eyebrow">MAKE YOURSELF AT HOME</p><h2>Bring your agents in.</h2>
    {!keys ? <>
      <p className="muted">Connect Codex and Claude Code to one little office. Your projects get their own rooms automatically.</p>
      <div className="segmented"><button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>New office</button><button className={tab === 'existing' ? 'active' : ''} onClick={() => setTab('existing')}>Join my office</button></div>
      <form onSubmit={e => { e.preventDefault(); void connect(); }}>
        {tab === 'new' ? <label>Invite code <span className="muted">{hosted ? '· from your office host' : '· optional locally'}</span><input value={invite} onChange={e => setInvite(e.target.value)} placeholder={hosted ? 'Enter your private invite' : 'Local offices don’t need a code'} required={hosted} type="password" autoComplete="off" /></label> : <><label>Office ID<input value={officeId} onChange={e => setOfficeId(e.target.value)} required /></label><label>Viewer key<input value={viewerKey} onChange={e => setViewerKey(e.target.value)} type="password" required autoComplete="off" /></label></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? 'Making room…' : tab === 'new' ? 'Create my office' : 'Open my office'}<ArrowRight size={16} /></button>
      </form>
      <div className="privacy-note"><span>⌁</span><p>Only activity metadata leaves your machine. Prompts, source code, command arguments, and tool output stay local.</p></div>
    </> : <>
      <p className="muted">Your office is ready. Add the observer to each coding client to start seeing real activity.</p>
      <div className="setup-step"><b>1</b><div><strong>Save your connection</strong><p>Keep this file private. Run the plugin’s setup script with this file to pair your machine.</p><button className="secondary" onClick={() => downloadConfig()}><Download size={15} /> Connection file</button></div></div>
      <div className="setup-step"><b>2</b><div><strong>Install your plugins</strong><p>Unzip the package, follow its README, and review the hooks in your coding client.</p><div className="button-row"><a className="secondary" href="/plugins/codex.zip" download><Download size={14} /> Codex</a><a className="secondary" href="/plugins/claude.zip" download><Download size={14} /> Claude Code</a></div></div></div>
      <div className="recovery"><strong>Save your viewer credentials</strong><p>Use these to open this office on another browser. They’re shown only once.</p><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(`Office ID: ${keys.officeId}\nViewer key: ${keys.viewerKey}`); setCopied(true); } catch { setError(`Office ID: ${keys.officeId} · Viewer key: ${keys.viewerKey}`); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy viewer credentials'}</button></div>
      <button className="secondary" onClick={() => downloadConfig(true)}><Download size={15} /> Viewer recovery file</button>
      {error && <p className="form-error">{error}</p>}
      <button className="primary full" onClick={() => { onConnect(keys.officeId); onClose(); }}>Step into my office <ArrowRight size={16} /></button>
    </>}
    <p className="muted"><a href="https://github.com/michaelraim/tinyagents/blob/main/docs/launch-guide.md" target="_blank" rel="noreferrer">Setup guide and troubleshooting ↗</a></p>
  </dialog>;
}
