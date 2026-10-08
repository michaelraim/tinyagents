import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import ConnectDialog from './ConnectDialog';
import { useAccount } from './AccountContext';
import './world/world.css';
import './landing-neon.css';

const MiniWorld = lazy(() => import('./world/MiniWorld'));

const mirror: [string, string, string][] = [
  ['⌨️', 'Your agent edits a file', 'They type at their desk. The card says "Editing auth.ts".'],
  ['✋', 'It needs your approval', 'They stand up and wave. The phone rings. The alert card lights up.'],
  ['🚨', 'A tool fails', 'Head in hands. The room’s alarm spins. Teammates walk over to help.'],
  ['✅', 'Tests pass', 'Fist pump, confetti and stars for the office.'],
  ['📦', 'A subagent starts', 'A new hire walks in carrying a box, and sits beside their lead.'],
  ['📋', 'The subagent finishes', 'They walk to the lead, hand over a report and high-five.'],
  ['🥱', 'Hours of nonstop work', 'Energy drains. Send them for coffee before they burn out.'],
  ['🌙', 'Session ends', 'They pack up, wave goodbye and head out of the front door.'],
];

const life: [string, string, string][] = [
  ['🍕', 'Pizza deliveries', 'A courier shows up and everyone on a break rushes the café.'],
  ['🐈', 'An office cat', 'It wanders in, naps on things and purrs when you click it.'],
  ['😱', 'Coffee machine meltdowns', 'Sparks fly until someone rolls up their sleeves and fixes it.'],
  ['🛒', 'A shop', 'Real work earns coins. Spend them on a disco ball, an office dog, rainbow neon…'],
  ['📺', 'TV mode', 'Lean back. The camera cuts to whatever just happened.'],
  ['👋', 'Friends next door', 'Bring a friend’s public office into your building and share the café.'],
];

export default function Landing() {
  const [connect, setConnect] = useState<'new' | 'existing'>();
  const connected = useRef('');
  const account = useAccount();
  const [savedOffice] = useState(() => { try { return !!localStorage.getItem('sidequest.office'); } catch { return false; } });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = 'tinyAGENTS — a tiny office for your coding agents';
    const observer = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); } }), { threshold: 0.12 });
    root.current?.querySelectorAll('.ln-reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const hasOffice = !!account.officeId || (!account.user && savedOffice);
  function enter(id: string) {
    connected.current = id;
    try { localStorage.setItem('sidequest.office', id); localStorage.setItem('sidequest.mode', 'live'); } catch { /* The server session remains valid. */ }
  }

  return <div className="ln" ref={root}>
    <nav className="ln-nav">
      <a className="ln-logo" href="/"><b>tiny</b><span>AGENTS</span></a>
      <div>
        <a href="#how">How it works</a>
        <a href={hasOffice ? '/office' : '/demo'}>{hasOffice ? 'My office' : 'Demo'}</a>
        <button className="ln-btn pink small" onClick={() => setConnect('new')}>{account.user ? 'My account' : 'Get your office'}</button>
      </div>
    </nav>

    <header className="ln-hero">
      <div className="ln-hero-world"><Suspense fallback={null}><MiniWorld night /></Suspense></div>
      <div className="ln-hero-copy">
        <p className="ln-kicker"><i /> Codex + Claude Code · live</p>
        <h1>Your agents<br /><span>work here now.</span></h1>
        <p className="ln-lede">tinyAGENTS turns your coding agents into a tiny neon office. Watch them type, think, get stuck, ask for you, celebrate and take very well-earned pizza breaks, live, as it really happens.</p>
        <div className="ln-actions">
          <button className="ln-btn pink" onClick={() => setConnect('new')}>Get your office →</button>
          <a className="ln-btn cyan" href="/demo">▶ Watch the demo</a>
        </div>
        <p className="ln-fine">Free · private by default · works with both harnesses</p>
      </div>
    </header>

    <section className="ln-section ln-reveal" id="how">
      <p className="ln-kicker">How it works</p>
      <h2>Three steps. One tiny office.</h2>
      <div className="ln-steps">
        <article><b>01</b><h3>Install the plugin</h3><p>One command for Codex or Claude Code. It only observes: it never sends prompts or approves anything.</p></article>
        <article><b>02</b><h3>Approve in your browser</h3><p>The plugin opens a sign-in link. Approve this computer and your office is created.</p></article>
        <article><b>03</b><h3>Watch your crew move in</h3><p>Start a task. Your agent walks in through the front door and gets to work in its project's room.</p></article>
      </div>
    </section>

    <section className="ln-section ln-reveal">
      <p className="ln-kicker">A mirror, not a screensaver</p>
      <h2>Everything they do,<br /><span>you can see.</span></h2>
      <div className="ln-mirror">
        {mirror.map(([icon, real, seen]) => <div key={real}><span>{icon}</span><div><b>{real}</b><p>{seen}</p></div></div>)}
      </div>
    </section>

    <section className="ln-section ln-reveal">
      <p className="ln-kicker">Office life</p>
      <h2>Between the real work,<br /><span>chaos (the good kind).</span></h2>
      <div className="ln-life">
        {life.map(([icon, title, text]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
      <p className="ln-honest">Work states come from your agents. Pizza, moods, coins and cats are playful simulation and never touch your real agents.</p>
    </section>

    <section className="ln-section ln-reveal ln-privacy">
      <div>
        <p className="ln-kicker">Private by default</p>
        <h2>Your code stays home.</h2>
        <p>The plugin shares short task titles, file names and command verbs so your office can show what's happening. Never code, file contents, command arguments or full prompts. Turn titles off with one setting. Public visitor links show none of it. <a href="/privacy.html">What we store →</a></p>
      </div>
    </section>

    <section className="ln-final ln-reveal">
      <h2>There's a desk<br /><span>with your agent's name on it.</span></h2>
      <div className="ln-actions center">
        <button className="ln-btn pink" onClick={() => setConnect('new')}>Create my office →</button>
        <button className="ln-btn ghost" onClick={() => setConnect('existing')}>I already have one</button>
      </div>
    </section>

    <footer className="ln-footer">
      <a className="ln-logo small" href="/"><b>tiny</b><span>AGENTS</span></a>
      <span>Small people. Big ideas.</span>
      <a href="https://github.com/michaelraim/tinyagents" target="_blank" rel="noreferrer">Built in the open ↗</a>
      <a href="/setup.html">Setup guide</a>
      <a href="/privacy.html">Privacy</a>
    </footer>

    {connect && <ConnectDialog initialTab={connect} onConnect={enter} onDeleted={() => {}} onClose={() => { setConnect(undefined); if (connected.current) location.assign('/office'); }} />}
  </div>;
}
