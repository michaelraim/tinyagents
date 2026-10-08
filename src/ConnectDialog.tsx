import { useEffect, useState } from 'react';
import { ArrowRight, Download, Github, Gitlab, LogOut } from 'lucide-react';
import { useAccount, accountRequest } from './AccountContext';
import LegacyConnectDialog from './LegacyConnectDialog';
import Modal, { Tabs } from './Modal';
import InstallPlugins from './InstallPlugins';
import { localTimeZone } from '../shared/clock';
import { diagnosticReport } from './diagnostics';
type Props = { onClose: () => void; onConnect: (id: string) => void; onDeleted: (id: string) => void; initialTab?: 'new' | 'existing' };
type Connection = { id: string; name: string; createdAt: number; reporting?: {lastReceivedAt: number; providers: Partial<Record<'codex'|'claude', number>>} | null };
export default function ConnectDialog(props: Props) {
  const account = useAccount();
  const [tab, setTab] = useState<'office' | 'connect' | 'account'>('office');
  const [legacy, setLegacy] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(location.search).has('error') || new URLSearchParams(location.search).has('auth_error') ? 'Sign-in did not finish. Try again with your original provider. You can link another provider after signing in.' : '');
  const [name, setName] = useState('My computer'), [confirmation, setConfirmation] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]), [linked, setLinked] = useState<string[]>([]);
  const [download, setDownload] = useState<{officeId: string; ingestKey: string}>();
  function downloadDiagnostics() {
    const report={...diagnosticReport(),connections:connections.map(c=>({lastReceivedAt:c.reporting?.lastReceivedAt??null,providers:c.reporting?.providers??{}}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='tinyagents-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ['welcome', 'auth_error', 'error', 'error_description']) url.searchParams.delete(key);
    history.replaceState({}, '', url);
  }, []);
  useEffect(() => {
    if (!account.user) return;
    const controller = new AbortController();
    void fetch('/api/auth/list-accounts', { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(rows => setLinked(rows.map((row: {providerId: string}) => row.providerId))).catch(() => {});
    const refreshConnections = () => { if (account.officeId) void fetch(`/api/connections?office=${account.officeId}`, { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setConnections).catch(() => {}); };
    refreshConnections(); const timer = setInterval(refreshConnections, 10000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [account.user, account.officeId]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } }
  async function signIn(provider: 'github' | 'gitlab', link = false) {
    await run(async () => {
      const result = await accountRequest(`/api/auth/${link ? 'link-social' : 'sign-in/social'}`, { provider, callbackURL: '/office?welcome=1', errorCallbackURL: '/office?auth_error=1' });
      if (!result.url) throw Error('This sign-in provider is not ready yet. Please try again later.');
      location.assign(result.url);
    });
  }
  async function create() { await run(async () => { const result = await accountRequest('/api/account/office', { timeZone: localTimeZone() }); await account.refresh(); props.onConnect(result.officeId); }); }
  async function claim(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 16384) throw Error('Choose your original office recovery JSON file.');
      const data = JSON.parse(await file.text());
      if (data.url !== location.origin || typeof data.ownerKey !== 'string') throw Error('Choose the owner recovery file for this website.');
      const result = await accountRequest('/api/account/office', { officeId: data.officeId, ownerKey: data.ownerKey });
      await account.refresh(); props.onConnect(result.officeId);
    });
  }
  function saveConfig(keys = download) {
    if (!keys) return;
    const content = { endpoint: `${location.origin}/api/events`, officeId: keys.officeId, ingestKey: keys.ingestKey, projectName: '', projectId: '', theme: 'studio' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tinyagents.config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function pair() { await run(async () => {
    const keys = await accountRequest(`/api/connections?office=${account.officeId}`, { name }); setDownload(keys); saveConfig(keys);
    const response = await fetch(`/api/connections?office=${account.officeId}`); if (response.ok) setConnections(await response.json());
  }); }
  async function signOut(remove = false) { await run(async () => {
    await accountRequest(remove ? '/api/account' : '/api/auth/sign-out', undefined, remove ? 'DELETE' : 'POST');
    try { localStorage.removeItem('sidequest.office'); } catch { /* Cookies remain authoritative. */ }
    location.assign('/');
  }); }
  if (legacy) return <LegacyConnectDialog {...props} initialTab={account.local ? props.initialTab : 'existing'} />;
  const status = <>{busy && <p className="ui-note" role="status">One moment…</p>}{error && <p className="ui-alert" role="alert">{error}</p>}</>;
  const foot = <p className="ui-note"><a href="/privacy.html" target="_blank" rel="noreferrer">What we store ↗</a> · <a href="/setup.html" target="_blank" rel="noreferrer">Setup help ↗</a> · Your office starts private.</p>;
  const social = (link = false) => <div className="ui-social">{(['github', 'gitlab'] as const).map(provider => <button key={provider} disabled={busy || !account.providers[provider] || (link && linked.includes(provider))} onClick={() => void signIn(provider, link)}>
    {provider === 'github' ? <Github size={22}/> : <Gitlab size={22}/>}
    <span>{link ? (linked.includes(provider) ? '✓ ' : '+ ') : 'Continue with '}{provider === 'github' ? 'GitHub' : 'GitLab'}{link && linked.includes(provider) ? ' linked' : ''}</span>
    {!(link && linked.includes(provider)) && <ArrowRight size={18}/>}
    {!account.providers[provider] && <small>Coming online soon</small>}
  </button>)}</div>;

  if (account.loading || account.unavailable || !account.user) return <Modal eyebrow="Your crew. Your little corner." title={account.loading ? 'Finding your desk…' : account.unavailable ? 'Reception is closed' : 'Sign in'} onClose={props.onClose} foot={foot}>
    {account.loading ? <p role="status">Checking in at reception…</p> : account.unavailable ? <>
      <p>We couldn’t reach the office service. Try again in a moment.</p>
      <button className="ui-btn primary full" onClick={() => void account.refresh()}>Try again</button>
    </> : <>
      <section className="ui-card"><h3>Already have an office?</h3>{social()}<p className="ui-note">Just your profile and email. No access to your repositories.</p>
        {!account.providers.github && !account.providers.gitlab && <p className="ui-note">{account.local ? 'This local bridge uses development keys. Social sign-in runs on the Cloudflare Worker.' : 'Social sign-in is being connected. You can explore the demo meanwhile.'}</p>}
      </section>
      <section className="ui-card"><h3>New here? Install a plugin</h3><p>It opens your browser to sign in and connect. Your office sets itself up.</p><InstallPlugins/></section>
      <button className="ui-btn ghost" onClick={() => setLegacy(true)}>{account.local ? 'Local bridge setup or recovery file' : 'I have an office recovery file'}</button>
      {status}
    </>}
  </Modal>;

  if (!account.officeId) return <Modal eyebrow={`Welcome, ${account.user.name}`} title="Let’s find your office" onClose={props.onClose} foot={foot}>
    <section className="ui-card"><h3>Connect a coding app</h3><p>Install a plugin and approve this computer in the browser. We’ll create your office automatically.</p><InstallPlugins/></section>
    <button className="ui-btn primary full big" disabled={busy} onClick={() => void create()}>Open an empty office <ArrowRight size={16}/></button>
    <p className="ui-note">☀️ Office clock: {localTimeZone().replaceAll('_', ' ')}</p>
    <details className="ui-more"><summary>I already have an office</summary><p>Load its owner recovery file once. Its people, history and connected computers stay as they are; future sign-ins use this account.</p>
      <label className="ui-field">Recovery file<input disabled={busy} type="file" accept="application/json,.json" onChange={e => void claim(e.target.files?.[0])}/></label></details>
    {status}
  </Modal>;

  const live = connections.filter(c => c.reporting?.lastReceivedAt);
  return <Modal eyebrow={`Welcome back, ${account.user.name}`} title="Your office" onClose={props.onClose} foot={<>
      <button className="ui-btn primary full big" disabled={busy} onClick={() => { props.onConnect(account.officeId!); props.onClose(); }}>Step into my office <ArrowRight size={16}/></button>{foot}</>}
    tabs={<Tabs label="Account sections" value={tab} onChange={setTab} options={[['office', 'Office'], ['connect', 'Connect'], ['account', 'Account']]} />}>
    {tab === 'office' && <>
      <section className="ui-card"><h3>Computers reporting in</h3>
        {connections.length ? connections.map(c => <div className="ui-item" key={c.id}><div><b>{c.name}</b><span className="ui-pills">{(['claude', 'codex'] as const).map(p => {
          const at = c.reporting?.providers[p];
          return <span key={p} className={`ui-pill ${at ? 'on' : ''}`} title={at ? new Date(at).toLocaleString() : 'No activity yet'}>{p === 'codex' ? 'Codex' : 'Claude Code'} · {at ? ago(at) : 'nothing yet'}</span>;
        })}</span></div></div>) : <div className="ui-empty"><b>No computers yet</b>Install a plugin on the Connect tab and approve it in your browser.</div>}
        {!!connections.length && !live.length && <p className="ui-note">Paired, but nothing received yet. Start a task in Codex or Claude Code.</p>}
      </section>
      <section className="ui-card"><h3>Agents not showing up?</h3>
        <p>Ask your coding agent: <strong>“Diagnose my tinyAGENTS connection.”</strong> If it points at another office, ask <strong>“Switch tinyAGENTS to my signed-in office.”</strong></p>
        <p className="ui-note">Office ID <code>{account.officeId}</code></p>
        <div className="ui-row"><button className="ui-btn small" onClick={downloadDiagnostics}><Download size={14}/> Download diagnostics</button></div>
        <p className="ui-note">Recent browser updates and server receipts. No prompts, project names or credentials.</p>
      </section>
    </>}
    {tab === 'connect' && <>
      <section className="ui-card"><h3>Install or update a plugin</h3><p>On each computer you code on. Codex and Claude Code share one office.</p><InstallPlugins/></section>
      <details className="ui-more"><summary>Advanced: manual connection file</summary>
        <label className="ui-field">Computer name<input maxLength={60} value={name} onChange={e => setName(e.target.value)}/></label>
        <button className="ui-btn full" disabled={busy || !name.trim()} onClick={() => void pair()}><Download size={15}/> Download connection file</button>
        {download && <><p className="ui-ok" role="status">Import it with scripts/setup.mjs in the plugin folder.</p><button className="ui-btn ghost" onClick={() => saveConfig()}>Download it again</button></>}
      </details>
      {!!connections.length && <details className="ui-more"><summary>Paired computers ({connections.length})</summary>
        <p className="ui-note">Removing a computer stops its reports. Others stay connected.</p>
        {connections.map(c => <div className="ui-item" key={c.id}><div><b>{c.name}</b><small>Paired {new Date(c.createdAt).toLocaleDateString()}</small></div>
          <button className="ui-btn danger small" disabled={busy} onClick={() => void run(async () => { await accountRequest(`/api/connections?office=${account.officeId}&id=${c.id}`, undefined, 'DELETE'); setConnections(v => v.filter(row => row.id !== c.id)); })}>Remove</button></div>)}
      </details>}
    </>}
    {tab === 'account' && <>
      <section className="ui-card"><h3>Signed in</h3><div className="ui-item"><span className="ui-avatar">{account.user.name.slice(0, 1).toUpperCase()}</span><div><b>{account.user.name}</b><small>{account.user.email}</small></div>
        <button className="ui-btn small" disabled={busy} onClick={() => void signOut()}><LogOut size={14}/> Sign out</button></div></section>
      <section className="ui-card"><h3>Ways to sign in</h3><p>Link both providers to reach the same office with either.</p>{social(true)}</section>
      <section className="ui-card danger"><h3>Danger zone</h3><p>Deleting removes your account, office, history and all connection keys. Your code stays on your computer.</p>
        <label className="ui-field">Type DELETE to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label>
        <button className="ui-btn danger full" disabled={busy || confirmation !== 'DELETE'} onClick={() => void signOut(true)}>Delete account and office</button></section>
    </>}
    {status}
  </Modal>;
}

function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}
