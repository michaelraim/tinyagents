import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Github, Gitlab, Monitor, ShieldCheck } from 'lucide-react';
import { useAccount, accountRequest } from './AccountContext';
import BrandWordmark from './BrandWordmark';

type Pairing = { name: string; provider: string; expiresAt: number; status: 'pending' | 'approved' | 'connected' };
export default function PairingPage() {
  const account = useAccount(), code = new URLSearchParams(location.search).get('code') || '';
  const valid = /^[A-F0-9]{12}$/.test(code);
  const [pair, setPair] = useState<Pairing>(), [error, setError] = useState(new URLSearchParams(location.search).has('auth_error') ? 'Sign-in did not finish. Try again.' : ''), [busy, setBusy] = useState(false), [expired, setExpired] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/pairing?code=${code}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 410) setExpired(true); throw Error(data.error || 'Could not check the connection.'); }
      setPair(data); setError('');
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Try again in a moment.'); }
  }, [code]);
  useEffect(() => {
    if (!valid || !account.user || expired || pair?.status === 'connected') return;
    const controller = new AbortController(); void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [valid, account.user, refresh, expired, pair?.status]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } }
  async function signIn(provider: 'github' | 'gitlab') {
    await action(async () => { const result = await accountRequest('/api/auth/sign-in/social', { provider, pairingCode: code }); if (!result.url) throw Error('Sign-in is unavailable.'); location.assign(result.url); });
  }
  async function approve() { await action(async () => { await accountRequest('/api/pairing/approve', { code }); await refresh(); await account.refresh(); }); }
  const connected = pair?.status === 'connected', approved = pair?.status === 'approved';
  return <main className="pairing-page">
    <a className="pairing-brand" href="/"><img src="/favicon.svg" alt=""/><BrandWordmark/></a>
    <section className={`pairing-card ${connected ? 'is-connected' : ''}`} aria-labelledby="pairing-title">
      <div className="pairing-scene" aria-hidden="true"><span className="pairing-person">⌘</span><span className="pairing-dots">•••</span><span className="pairing-house">{connected ? '🎉' : '🏡'}</span><span className="pairing-dots">•••</span><span className="pairing-person claude">✳</span></div>
      <p className="eyebrow">{connected ? 'YOUR CREW HAS THE KEYS' : 'A LITTLE OFFICE. ONE QUICK HELLO.'}</p>
      <h1 id="pairing-title">{connected ? 'You’re home.' : approved ? 'Making room for your crew…' : 'Give this computer a desk.'}</h1>
      {!valid || expired ? <><p>This connection link has expired or is incomplete.</p><p>Ask your coding agent <strong>“connect tinyAGENTS”</strong> for a fresh link.</p><a className="secondary full" href="/setup.html">Setup help</a></> : account.loading ? <p role="status">Checking in at reception…</p> : account.unavailable ? <><p>Reception is taking a moment.</p><button className="primary full" onClick={() => void account.refresh()}>Try again</button></> : !account.user ? <>
        <p>Sign in once. We’ll find your office—or make you a new one.</p>
        <div className="social-logins">{(['github', 'gitlab'] as const).map(provider => <button className={`social-login ${provider}`} disabled={busy || !account.providers[provider]} key={provider} onClick={() => void signIn(provider)}>{provider === 'github' ? <Github size={22}/> : <Gitlab size={22}/>}<span>Continue with {provider === 'github' ? 'GitHub' : 'GitLab'}</span><ArrowRight size={18}/></button>)}</div>
        {!account.providers.github && !account.providers.gitlab && <p>Sign-in is being set up. Please try again soon.</p>}
        <p className="account-fine">Just your profile and email. No repository access.</p>
      </> : connected ? <>
        <div className="pairing-computer"><span className="connected-check"><Check size={25}/></span><div><strong>{pair.name}</strong><small>Connected to {account.user.name}’s office</small></div></div>
        <p>Start a task in Codex or Claude Code. Your agents will move in as they work.</p><a className="primary full" href="/office">Step into my office <ArrowRight size={18}/></a>
        <p className="account-fine">Both plugins share this connection. You can close this tab.</p>
      </> : pair ? <>
        <div className="pairing-computer"><Monitor size={28}/><div><strong>{pair.name}</strong><small>{pair.provider === 'codex' ? 'Codex' : pair.provider === 'claude' ? 'Claude Code' : 'Codex + Claude Code'} · connection {code.slice(0, 6)} {code.slice(6)}</small></div></div>
        {approved ? <><p role="status" className="pairing-wait">Waiting for the plugin to save your connection…</p><p className="account-fine">Keep the coding app running. This usually takes a few seconds.</p></> : <>
          <p>Connect to <strong>{account.user.name}’s office</strong>. Both plugins on this computer can send agent activity here.</p>
          <button className="primary full" disabled={busy} onClick={() => void approve()}>{busy ? 'Connecting…' : 'Connect this computer'} <ArrowRight size={17}/></button>
          <p className="account-fine">Approve only if you just installed or connected tinyAGENTS on this computer.</p>
          <button className="text-button" disabled={busy} onClick={() => void action(async () => { await accountRequest('/api/auth/sign-out'); await account.refresh(); setPair(undefined); })}>Use a different account</button>
        </>}
      </> : <p role="status">Finding your computer…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="pairing-privacy"><ShieldCheck size={15}/> Your office starts private. <a href="/privacy.html">What we store</a></p>
    </section><p className="pairing-footer">Small crew. Big things.</p>
  </main>;
}
