import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Github, Gitlab, LogOut, X } from 'lucide-react';
import { useAccount, accountRequest } from './AccountContext';
import LegacyConnectDialog from './LegacyConnectDialog';
import BrandWordmark from './BrandWordmark';
import InstallPlugins from './InstallPlugins';
import { localTimeZone } from '../shared/clock';
type Props = { onClose: () => void; onConnect: (id: string) => void; onDeleted: (id: string) => void; initialTab?: 'new' | 'existing' };
type Connection = { id: string; name: string; createdAt: number };
export default function ConnectDialog(props: Props) {
  const account = useAccount(), dialog = useRef<HTMLDialogElement>(null);
  const [legacy, setLegacy] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(location.search).has('error') || new URLSearchParams(location.search).has('auth_error') ? 'Sign-in did not finish. Try again with your original provider. You can link another provider after signing in.' : '');
  const [name, setName] = useState('My computer'), [confirmation, setConfirmation] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]), [linked, setLinked] = useState<string[]>([]);
  const [download, setDownload] = useState<{officeId: string; ingestKey: string}>();
  useEffect(() => { if (!legacy) dialog.current?.showModal(); }, [legacy]);
  useEffect(() => {
    const url = new URL(location.href);
    for (const key of ['welcome', 'auth_error', 'error', 'error_description']) url.searchParams.delete(key);
    history.replaceState({}, '', url);
  }, []);
  useEffect(() => {
    if (!account.user) return;
    const controller = new AbortController();
    void fetch('/api/auth/list-accounts', { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(rows => setLinked(rows.map((row: {providerId: string}) => row.providerId))).catch(() => {});
    if (account.officeId) void fetch(`/api/connections?office=${account.officeId}`, { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setConnections).catch(() => {});
    return () => controller.abort();
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
  return <dialog className="connect-dialog account-dialog" ref={dialog} onCancel={e => { e.preventDefault(); props.onClose(); }} onClick={e => { if (e.target === dialog.current) props.onClose(); }}>
    <button className="icon-button close-dialog" onClick={props.onClose} aria-label="Close account"><X size={18}/></button>
    <div className="account-welcome"><img src="/favicon.svg" alt=""/><BrandWordmark/><span>YOUR CREW. YOUR LITTLE CORNER OF THE INTERNET.</span></div>
    {account.loading ? <p role="status">Finding your desk…</p> : account.unavailable ? <><h2>We couldn’t reach reception.</h2><p>Try again in a moment.</p><button className="primary full" onClick={() => void account.refresh()}>Try again</button></> : !account.user ? <>
      <h2>Your crew is one plugin away.</h2><p className="muted">Install the plugin. It opens your browser to sign in and connect. Your office takes care of itself.</p><InstallPlugins/>
      <p className="account-fine">Already have an office? Sign in to visit it.</p>
      <div className="social-logins">{(['github', 'gitlab'] as const).map(provider => <button key={provider} className={`social-login ${provider}`} disabled={busy || !account.providers[provider]} onClick={() => void signIn(provider)}>{provider === 'github' ? <Github size={22}/> : <Gitlab size={22}/>}<span>Continue with {provider === 'github' ? 'GitHub' : 'GitLab'}</span><ArrowRight size={18}/>{!account.providers[provider] && <small>Coming online soon</small>}</button>)}</div>
      <p className="account-fine">Just your profile and email. No access to your repositories.</p>
      {!account.providers.github && !account.providers.gitlab && <p className="account-notice">{account.local ? 'This local observer bridge uses development keys. Social login runs on the Cloudflare Worker.' : 'Social sign-in is being connected. You can explore the demo or open an existing office below.'}</p>}
      <button className="text-button" onClick={() => setLegacy(true)}>{account.local ? 'Local bridge setup / existing recovery file' : 'Already have an office recovery file?'}</button>
    </> : <>
      <p className="eyebrow">WELCOME BACK, {account.user.name}</p><h2>{account.officeId ? 'The whole crew, connected.' : 'Let’s find your office.'}</h2>
      {!account.officeId ? <><p className="muted">Install a plugin and approve this computer in the browser. We’ll create your office automatically.</p><InstallPlugins/><button className="primary full" disabled={busy} onClick={() => void create()}>Open an empty office <ArrowRight size={16}/></button><p className="account-fine">☀️ Your office clock: {localTimeZone().replaceAll('_', ' ')}</p><details className="account-details"><summary>I already have an office</summary><p>Load its owner recovery file once. Its people, history and connected coding clients stay exactly where they are. Future sign-ins use this account.</p><label>Original recovery file<input disabled={busy} type="file" accept="application/json,.json" onChange={e => void claim(e.target.files?.[0])}/></label></details></> : <>
        <p className="muted">Install a plugin on each computer. Approve it in your browser. Codex and Claude Code share the same office automatically.</p><InstallPlugins/>
        <details className="account-details"><summary>Advanced: manual connection file</summary><div className="account-pair"><label>Computer name<input maxLength={60} value={name} onChange={e => setName(e.target.value)}/></label><button className="secondary full" disabled={busy || !name.trim()} onClick={() => void pair()}><Download size={16}/> Download connection file</button>{download && <><p className="account-fine" role="status">Use scripts/setup.mjs in the plugin folder to import this file.</p><button className="text-button" onClick={() => saveConfig()}>Download that file again</button></>}</div></details>
        <button className="primary full" disabled={busy} onClick={() => { props.onConnect(account.officeId!); props.onClose(); }}>Step into my office <ArrowRight size={16}/></button>
        {!!connections.length && <details className="account-details"><summary>Connected computers ({connections.length})</summary><p>Removing a computer stops its reports. Other computers stay connected.</p>{connections.map(c => <div className="account-connection" key={c.id}><span>{c.name}</span><button disabled={busy} onClick={() => void run(async () => { await accountRequest(`/api/connections?office=${account.officeId}&id=${c.id}`, undefined, 'DELETE'); setConnections(v => v.filter(row => row.id !== c.id)); })}>Remove</button></div>)}</details>}
      </>}
      <details className="account-details"><summary>Sign-in & account</summary><p>{account.user.email}</p>{(['github', 'gitlab'] as const).map(provider => <button className="secondary full" key={provider} disabled={busy || linked.includes(provider) || !account.providers[provider]} onClick={() => void signIn(provider, true)}>{linked.includes(provider) ? '✓ ' : '＋ '}{provider === 'github' ? 'GitHub' : 'GitLab'}{linked.includes(provider) ? ' connected' : ' — add another way to sign in'}</button>)}<p>Link the other provider here to use either login for the same office.</p><button className="secondary" disabled={busy} onClick={() => void signOut()}><LogOut size={15}/> Sign out</button><details className="delete-office"><summary>Delete my account and office</summary><p>This permanently removes your account, office, history and all connection keys. Your local coding projects stay on your computer.</p><label>Type DELETE<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off"/></label><button className="secondary full" disabled={busy || confirmation !== 'DELETE'} onClick={() => void signOut(true)}>Delete permanently</button></details></details>
    </>}
    {busy && <p role="status">One moment…</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <p className="account-fine"><a href="/privacy.html" target="_blank" rel="noreferrer">What we store ↗</a> · Your office starts private.</p>
  </dialog>;
}
