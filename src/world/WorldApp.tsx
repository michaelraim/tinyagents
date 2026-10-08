import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Building } from '../../shared/building';
import { sameSession, type Agent } from '../../shared/protocol';
import { useOffice } from '../useOffice';
import { useAccount } from '../AccountContext';
import { useFriends } from '../useFriends';
import { neighborhood } from '../../shared/neighborhood';
import { moodOf } from './sim';
import { useLiveWorld } from './useLiveWorld';
import { WorldScene, type CameraCommand } from './WorldScene';
import { since, statusOf } from './Overhead';
import { harness, projectColor } from './palette';
import { clockLabel, daylightAt, localHour } from './time';
import { useGame, type Toast } from './useGame';
import { dailyGoals, interactionCost, moodEmoji, moodOfAgent, rankFor, upgrades, type GameState, type Interaction } from './game';
import { verticalOf } from './Themes';
import { verticals } from '../../shared/verticals.mjs';
import ClockSettings from '../ClockSettings';
import { lookFor } from './Person';
import { usePortrait } from './portraits';
import { setSound, soundEnabled, play } from './sfx';
import { floatText } from './fx';
import './world.css';
import './hud.css';

const ConnectDialog = lazy(() => import('../ConnectDialog'));
const FriendsPanel = lazy(() => import('../FriendsPanel'));

type Panel = 'agents' | 'projects' | 'friends' | 'activity' | 'shop' | null;

const savedThemes = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem('ta.themes') ?? '{}'); } catch { return {}; } };

export default function WorldApp() {
  const office = useOffice();
  const account = useAccount();
  const book = useFriends();
  const [connectOpen, setConnectOpen] = useState(() => /[?&](welcome|auth_error|error)=/.test(location.search));
  const [panel, setPanel] = useState<Panel>(null);
  const [neighborsOn, setNeighborsOn] = useState(false);
  const now = office.now;
  // Coworking: friends' public offices rent rooms in your building and share the café and lounge.
  const neighbors = useMemo(() => neighborsOn && office.mode !== 'visit'
    ? book.friends.filter(f => f.included && f.id !== office.officeId && book.states[f.id]?.view).slice(0, 3).map(f => ({ id: f.id, view: book.states[f.id].view! }))
    : [], [neighborsOn, office.mode, book.friends, book.states, office.officeId]);
  // Room themes the viewer picked override the plugin's guess.
  const [themes, setThemes] = useState(savedThemes);
  const observed = useMemo(() => {
    const base = neighbors.length ? neighborhood(office.office, neighbors) : office.office;
    if (!Object.keys(themes).length) return base;
    return { ...base, agents: base.agents.map(a => themes[a.project.id] ? { ...a, project: { ...a.project, vertical: themes[a.project.id] } } : a) };
  }, [office.office, neighbors, themes]);
  const setTheme = (projectId: string, vertical: string) => {
    const next = { ...themes, [projectId]: vertical };
    setThemes(next);
    try { localStorage.setItem('ta.themes', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const goHome = () => { if (!office.officeId) { location.assign('/'); return; } office.enterLive(office.officeId); };
  const { plan, world, agents, roles, stateSince } = useLiveWorld(observed, now);

  const [selected, setSelected] = useState<string>();
  const [follow, setFollow] = useState<string>();
  const [selectedRoom, setSelectedRoom] = useState<string>();
  const [command, setCommand] = useState<CameraCommand>();
  const [speed, setSpeed] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sound, setSoundState] = useState(soundEnabled);
  const [quality, setQuality] = useState<'high' | 'low'>(() => { try { return localStorage.getItem('ta.quality') === 'low' || new URLSearchParams(location.search).has('low') ? 'low' : 'high'; } catch { return 'high'; } });
  const chooseQuality = (q: 'high' | 'low') => { setQuality(q); try { localStorage.setItem('ta.quality', q); } catch { /* ignore */ } };
  const [slowNote, setSlowNote] = useState(false);
  const floatToast = () => { setSlowNote(true); setTimeout(() => setSlowNote(false), 7000); };
  // Day and night follow the office's own clock; settings can preview either.
  const [timeOverride, setTimeOverride] = useState<number | null>(null);
  const daylight = timeOverride ?? daylightAt(localHour(now, office.office.timeZone));
  const nextId = useRef(1);
  type Command = CameraCommand extends infer C ? C extends CameraCommand ? Omit<C, 'id'> : never : never;
  const camera = (c: Command) => setCommand({ ...c, id: nextId.current++ } as CameraCommand);

  const officeKey = office.mode === 'demo' ? 'demo' : office.mode === 'visit' ? `visit:${office.visitId}` : office.officeId || 'local';
  const remote = useMemo(() => office.mode === 'live' && office.officeId ? { game: office.serverGame, post: office.postGame } : undefined, [office.mode, office.officeId, office.serverGame, office.postGame]);
  const { game, toasts, log, act, purchase, trigger, dismiss } = useGame(officeKey, agents, world, daylight, now, remote);

  // TV mode: the camera director cuts to whatever is happening, like a sim's spectator cam.
  const [tv, setTv] = useState(false);
  const [tvKey, setTvKey] = useState<string>();
  useEffect(() => {
    if (!tv) { setTvKey(undefined); return; }
    const cut = () => {
      const recent = toasts.find(t => t.agentKey && Date.now() - t.shownAt < 15_000 && agents.some(a => a.key === t.agentKey));
      const urgent = agents.find(a => a.state === 'waiting' || a.state === 'blocked');
      const busy = agents.filter(a => ['coding', 'thinking', 'reading', 'testing'].includes(a.state));
      const pool = busy.length ? busy : agents;
      const key = recent?.agentKey ?? urgent?.key ?? pool[Math.floor(Math.random() * pool.length)]?.key;
      if (!key) return;
      setTvKey(key); setFollow(key); setSelected(undefined);
      const body = world.bodies.get(key);
      if (body) camera({ kind: 'focus', x: body.x, z: body.z, zoom: 8 + Math.random() * 4 });
    };
    cut();
    const id = setInterval(cut, 9000);
    return () => clearInterval(id);
  }, [tv]);
  const stopTv = () => { if (tv) { setTv(false); setFollow(undefined); } };

  const needYou = agents.filter(a => a.state === 'waiting');
  const stuck = agents.filter(a => a.state === 'blocked' && now - a.at < 5 * 60_000);
  const working = agents.filter(a => ['coding', 'thinking', 'reading', 'testing'].includes(a.state) && now - a.at < 5 * 60_000).length;
  const attentionIndex = useRef(0);

  const focusAgent = (key: string, zoom = 9) => {
    const body = world.bodies.get(key);
    setSelected(key); setSelectedRoom(undefined);
    if (body) camera({ kind: 'focus', x: body.x, z: body.z, zoom });
  };
  const focusRoom = (id: string) => {
    const room = plan.rooms.find(r => r.id === id);
    if (!room) return;
    setSelectedRoom(id); setSelected(undefined); setFollow(undefined); setPanel(null);
    camera({ kind: 'focus', x: room.x, z: room.z, zoom: Math.max(room.w, room.d) * 1.5 + 6 });
  };
  const nextAttention = () => {
    const list = [...needYou, ...stuck];
    if (!list.length) return;
    focusAgent(list[attentionIndex.current++ % list.length].key);
  };
  /** A viewer interaction: costs coins, plays the reaction in the world. Purely visual. */
  const react = (key: string, kind: Interaction) => {
    const body = world.bodies.get(key);
    if (!act(key, kind)) { if (body) floatText('not enough 🪙', body.x, body.z, '#ff4f6d'); play('snag'); return; }
    play(kind === 'snack' ? 'coin' : kind === 'poke' ? 'pop' : 'star');
    if (kind === 'coffee') world.coffeeRun(key); else world.react(key, kind, performance.now());
    if (body && interactionCost[kind]) floatText(`-${interactionCost[kind]} 🪙`, body.x, body.z, '#ff9ad8');
    if (body && kind !== 'poke') setTimeout(() => floatText('💗', body.x, body.z, '#ff4fd8'), 400);
  };

  // Dev-only handle for automated screenshots.
  if (import.meta.env.DEV) (window as unknown as { __ta: unknown }).__ta = { focusAgent, agents, world, camera, trigger, purchase };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') { stopTv(); setSelected(undefined); setFollow(undefined); setSelectedRoom(undefined); setPanel(null); setSettingsOpen(false); }
      if (e.key === 'h') camera({ kind: 'home' });
      if (e.key === 'n') setTimeOverride(daylight < 0.45 ? 1 : 0);
      if (e.key === ' ') { e.preventDefault(); nextAttention(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const agent = agents.find(a => a.key === selected);
  const room = plan.rooms.find(r => r.id === selectedRoom);
  const clock = clockLabel(now, office.office.timeZone);
  const rank = rankFor(game.stars);
  const coinsBump = useBump(game.coins), starsBump = useBump(game.stars);
  // Rank up: a big banner and a fanfare when the letter improves.
  const [rankUp, setRankUp] = useState<string>();
  const lastRank = useRef(rank.letter);
  useEffect(() => {
    const order = 'DCBAS';
    if (order.indexOf(rank.letter) > order.indexOf(lastRank.current)) { setRankUp(rank.letter); play('fanfare'); setTimeout(() => setRankUp(undefined), 3200); }
    lastRank.current = rank.letter;
  }, [rank.letter]);
  const alert = alertFor(agents, game, now);

  return <div className="ta-world ta-hud">
    <WorldScene plan={plan} world={world} agents={agents} roles={roles} stateSince={stateSince} now={now} daylight={daylight}
      paused={office.paused} speed={speed} unlocked={game.unlocked} tv={tv} quality={quality} onSlow={() => { chooseQuality('low'); floatToast(); }} selectedKey={selected} followKey={follow} command={command}
      onSelect={key => { stopTv(); if (key) { play('click'); focusAgent(key, 8); } else { setSelected(undefined); setFollow(undefined); setSelectedRoom(undefined); } }}
      onPoke={key => react(key, 'poke')} onSelectRoom={focusRoom} />

    {/* ---------- Top-left: logo ---------- */}
    <a className="hud-logo" href="/">
      <span className="hud-wordmark"><b>tiny</b><span>AGENTS</span></span>
      <span className="hud-tagline">Small people. Big ideas.{office.mode === 'demo' && <em>demo</em>}{office.mode === 'visit' && <em>visiting</em>}</span>
    </a>

    {/* ---------- Top bar: resources, attention, clock, speed ---------- */}
    <div className="hud-top">
      <div key={`c${coinsBump}`} className={`hud-res ${coinsBump ? 'bump' : ''}`} title="Coins: earned by real work, spent on snacks, coffee and upgrades"><span className="hud-ico">🪙</span><b><Count value={game.coins} /></b></div>
      <div key={`s${starsBump}`} className={`hud-res ${starsBump ? 'bump' : ''}`} title="Stars: shipped tasks, green tests, squashed bugs"><span className="hud-ico">⭐</span><b><Count value={game.stars} /></b></div>
      <div className="hud-res muted" title="Agents working right now"><span className="hud-ico">⌨️</span><b>{working}</b><small>/{agents.length}</small></div>
      {(needYou.length > 0 || stuck.length > 0) && <button className="hud-need" onClick={nextAttention} title="Jump to who needs you (Space)">
        <span className="hud-faces">{[...needYou, ...stuck].slice(0, 3).map(a => <Face key={a.key} agent={a} lead={roles.get(a.key) === 'lead'} />)}</span>
        {needYou.length > 0 ? `${needYou.length} need${needYou.length === 1 ? 's' : ''} you!` : `${stuck.length} stuck!`}<span className="hud-warn">▲</span>
      </button>}
    </div>
    <div className="hud-right">
      <div className="hud-clock" title="Office clock">{daylight < 0.45 ? '🌙' : '☀️'}<span><small>{clock.day}</small>{clock.time}</span></div>
      <div className="hud-speed">
        <button className={office.paused ? 'on' : ''} onClick={() => office.setPaused(!office.paused)} title="Pause">❚❚</button>
        <button className={!office.paused && speed === 1 ? 'on' : ''} onClick={() => { office.setPaused(false); setSpeed(1); }} title="Normal speed">▶</button>
        <button className={!office.paused && speed === 2 ? 'on' : ''} onClick={() => { office.setPaused(false); setSpeed(2); }} title="Fast forward (animation only)">▶▶</button>
      </div>
      <button className="hud-gear" onClick={() => setSettingsOpen(v => !v)} title="Settings">⚙</button>
      <button className="hud-account" onClick={() => setConnectOpen(true)}>{account.user ? 'Account' : office.mode === 'demo' ? 'Get your office' : 'Sign in'}</button>
    </div>
    {settingsOpen && <div className="hud-settings hud-panel">
      <h3>Settings</h3>
      <label><input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); setSoundState(e.target.checked); if (e.target.checked) play('coin'); }} /> Sound effects</label>
      <div className="hud-seg">
        {([['High', 'high'], ['Fast', 'low']] as const).map(([label, value]) => <button key={label} className={quality === value ? 'on' : ''} onClick={() => chooseQuality(value)}>{label === 'High' ? '✨ High quality' : '⚡ Fast'}</button>)}
      </div>
      <div className="hud-seg">
        {([['Auto', null], ['Day', 1], ['Night', 0]] as const).map(([label, value]) => <button key={label} className={timeOverride === value ? 'on' : ''} onClick={() => setTimeOverride(value)}>{label}</button>)}
      </div>
      {office.mode === 'live' && office.officeId && <ClockSettings officeId={office.officeId} timeZone={office.office.timeZone} accountOwned={!!account.user && account.officeId === office.officeId} />}
      {office.mode === 'demo' && <>
        <h3>Demo: make something happen</h3>
        <div className="hud-chips">
          {[['🍕', 'pizza'], ['🎂', 'birthday'], ['😱', 'coffee-broken'], ['🐈', 'cat'], ['🌧️', 'rain'], ['⚡', 'flicker'], ['🦆', 'duck']].map(([icon, kind]) => <button key={kind} onClick={() => trigger(kind)}>{icon} {kind}</button>)}
          <button onClick={() => office.addDemo('agent')}>📦 new hire</button>
          <button onClick={() => office.addDemo('project')}>🏢 new project</button>
        </div>
      </>}
    </div>}

    {slowNote && <div className="hud-tv">⚡ Switched to fast graphics to keep things smooth <button onClick={() => { chooseQuality('high'); setSlowNote(false); }}>Undo</button></div>}
    {rankUp && <div className="hud-rankup"><small>RANK UP!</small><b>{rankUp}</b><span>Your office is on fire 🔥</span></div>}

    {/* ---------- Score card ---------- */}
    <div className="hud-score hud-panel">
      <div className="hud-score-row"><span>🏆 SCORE</span><b>{String(game.stars * 10).padStart(6, '0')}</b></div>
      <div className="hud-rank"><div className="hud-bar"><i style={{ width: `${rank.progress * 100}%` }} /></div><span>RANK <b>{rank.letter}</b></span></div>
    </div>

    {/* ---------- Left nav ---------- */}
    <nav className="hud-nav">
      <NavButton icon="🏠" label="Office" active={!panel} onClick={() => { setPanel(null); setSelected(undefined); setSelectedRoom(undefined); camera({ kind: 'home' }); }} />
      <NavButton icon="🧑‍💻" label="Agents" badge={agents.length} active={panel === 'agents'} onClick={() => setPanel(p => p === 'agents' ? null : 'agents')} />
      <NavButton icon="🗂️" label="Projects" badge={plan.rooms.filter(r => r.kind === 'project').length} active={panel === 'projects'} onClick={() => setPanel(p => p === 'projects' ? null : 'projects')} />
      <NavButton icon="🛒" label="Shop" badge={upgrades.filter(u => !game.unlocked.includes(u.id) && game.coins >= u.price).length || undefined} active={panel === 'shop'} onClick={() => setPanel(p => p === 'shop' ? null : 'shop')} />
      <NavButton icon="📺" label={tv ? 'TV: on' : 'TV mode'} active={tv} onClick={() => { if (tv) stopTv(); else { setTv(true); setPanel(null); } }} />
      <NavButton icon="📰" label="Activity" active={panel === 'activity'} onClick={() => setPanel(p => p === 'activity' ? null : 'activity')} />
      {office.mode !== 'demo' && <NavButton icon="👋" label="Friends" badge={neighbors.length || undefined} active={panel === 'friends'} onClick={() => setPanel(p => p === 'friends' ? null : 'friends')} />}
    </nav>

    {panel === 'agents' && <SidePanel title="Agents" onClose={() => setPanel(null)}>
      {agents.length === 0 && <p className="hud-muted">Nobody here yet.</p>}
      {agents.map(a => <RosterRow key={a.key} agent={a} role={roles.get(a.key) ?? 'solo'} game={game} now={now} onClick={() => focusAgent(a.key)} />)}
    </SidePanel>}
    {panel === 'projects' && <SidePanel title="Projects" onClose={() => setPanel(null)}>
      {plan.rooms.filter(r => r.kind === 'project').map(r => {
        const members = r.pods.flatMap(p => p.seats.map(s => agents.find(a => a.key === s.agent.key) ?? s.agent));
        const busy = members.filter(a => ['coding', 'thinking', 'reading', 'testing'].includes(a.state)).length;
        return <button key={r.id} className="hud-project" onClick={() => focusRoom(r.id)} style={{ ['--c' as string]: projectColor(r.slot).carpet }}>
          <b>{r.project!.name}</b><span>{members.length} agents · {busy} working{members.some(a => a.state === 'waiting') ? ' · ✋ needs you' : ''}</span>
        </button>;
      })}
    </SidePanel>}
    {panel === 'shop' && <SidePanel title={`Shop · ${game.coins} 🪙`} onClose={() => setPanel(null)}>
      <p className="hud-muted">Real work earns coins. Spend them to make the office yours.</p>
      {upgrades.map(u => {
        const owned = game.unlocked.includes(u.id), afford = game.coins >= u.price;
        return <div key={u.id} className={`hud-shop ${owned ? 'owned' : ''}`}>
          <span className="hud-shop-icon">{u.icon}</span>
          <div><b>{u.name}</b><small>{u.detail}</small></div>
          <button disabled={owned || !afford} onClick={() => { if (!purchase(u.id)) play('snag'); }}>{owned ? 'Owned' : `${u.price} 🪙`}</button>
        </div>;
      })}
    </SidePanel>}
    {tv && tvKey && <div className="hud-tv">📺 TV MODE · {agents.find(a => a.key === tvKey)?.name} <small>{agents.find(a => a.key === tvKey)?.task ?? ''}</small> <button onClick={stopTv}>Exit</button></div>}
    {panel === 'activity' && <SidePanel title="Activity" onClose={() => setPanel(null)}>
      {log.length === 0 && <p className="hud-muted">Things will show up here as they happen.</p>}
      {log.map(e => <div key={e.id} className={`hud-log ${e.tone}`} onClick={() => e.agentKey && focusAgent(e.agentKey)}>
        <span>{e.icon}</span><div><b>{e.title}</b>{e.detail && <small>{e.detail}</small>}{e.cosmetic && <em>office life</em>}</div>
      </div>)}
    </SidePanel>}

    {/* ---------- Toasts ---------- */}
    <div className="hud-toasts">{toasts.filter(t => now - t.shownAt < 5500).slice(0, 3).map(t => <ToastCard key={t.id} toast={t} onClick={() => { if (t.agentKey) focusAgent(t.agentKey); dismiss(t.id); }} />)}</div>

    {/* ---------- Daily goals ---------- */}
    <div className="hud-goals hud-panel">
      <h3>📋 DAILY GOALS</h3>
      {dailyGoals(game, agents).map(g => <div key={g.label} className={`hud-goal ${g.value >= g.target ? 'done' : ''}`}>
        <span className="hud-check">{g.value >= g.target ? '✔' : ''}</span>
        <span className="hud-goal-label">{g.label}</span>
        <div className="hud-bar"><i style={{ width: `${Math.min(100, g.value / g.target * 100)}%` }} /></div>
        <small>{Math.min(g.value, g.target)}/{g.target}</small>
      </div>)}
    </div>

    {/* ---------- The alert card ---------- */}
    {alert && !agent && <AlertCard alert={alert} roles={roles} onJump={() => focusAgent(alert.agent.key)}
      onCheer={() => react(alert.agent.key, 'cheer')} onBreak={() => react(alert.agent.key, 'coffee')} />}

    {agent && <AgentPanel agent={agent} agents={agents} roles={roles} now={now} game={game} since={stateSince.get(agent.key) ?? agent.joinedAt}
      mood={world.bodies.get(agent.key)?.mood ?? moodOf(agent, now)} following={follow === agent.key}
      onClose={() => { setSelected(undefined); setFollow(undefined); }}
      onFollow={() => setFollow(f => f === agent.key ? undefined : agent.key)}
      onFocus={focusAgent} onReact={kind => react(agent.key, kind)} />}
    {room && !agent && <RoomPanel room={room} agents={agents} now={now} onClose={() => setSelectedRoom(undefined)} onFocus={focusAgent} onTheme={setTheme} />}

    <div className="hud-zoom">
      <button onClick={() => camera({ kind: 'zoom', by: 0.75 })} title="Zoom in">＋</button>
      <button onClick={() => camera({ kind: 'zoom', by: 1.33 })} title="Zoom out">－</button>
      <button onClick={() => { setFollow(undefined); camera({ kind: 'home' }); }} title="Whole office (H)">⌂</button>
    </div>

    {office.mode === 'visit' && <div className="hud-visit">👀 Visiting <b>{office.publicView?.profile.name ?? 'an office'}</b> · read-only <button onClick={goHome}>Back to my office</button></div>}

    <Suspense fallback={null}>
      {connectOpen && <ConnectDialog onClose={() => setConnectOpen(false)} onConnect={id => { office.enterLive(id); setSelected(undefined); }}
        onDeleted={id => { if (id === office.officeId) office.forgetOffice(); setSelected(undefined); }} />}
      {panel === 'friends' && <div className="ta-friends"><FriendsPanel accountOwned={!!account.user && account.officeId === office.officeId} book={book} officeId={office.officeId}
        visitId={office.mode === 'visit' ? office.visitId : ''} onVisit={id => { office.visit(id); setPanel(null); setSelected(undefined); }} onHome={goHome}
        onConnect={() => setConnectOpen(true)} onClose={() => setPanel(null)} neighborhoodOn={neighborsOn} onNeighborhood={setNeighborsOn}
        onHangout={() => { /* Neighbours meet in the shared café and lounge on their own. */ }} designs={{}} now={now} /></div>}
    </Suspense>

    {!agents.length && office.mode !== 'demo' && <div className="hud-empty hud-panel">
      <h2>{office.mode === 'visit' ? 'Lights are off' : 'Your office is ready.'}</h2>
      {office.mode === 'visit'
        ? <p>Nobody's in right now. Check back when they're working.</p>
        : account.user || office.officeId
          ? <p>{office.connection}. Start a task in Codex or Claude Code and your crew walks in through the front door.</p>
          : <p>Connect Codex or Claude Code and watch your agents move in.</p>}
      {office.mode !== 'visit' && !account.user && !office.officeId && <button className="hud-cta" onClick={() => setConnectOpen(true)}>Connect your agents →</button>}
      <a href="/demo">See a busy office →</a>
    </div>}
  </div>;
}

/** What deserves the big card: someone waiting for you, someone stuck, or someone exhausted. */
function alertFor(agents: Agent[], game: GameState, now: number) {
  const waiting = agents.find(a => a.state === 'waiting');
  if (waiting) return { agent: waiting, title: 'AGENT NEEDS YOU!', body: `${waiting.name}: ${waiting.activity}`, tone: 'ask' as const };
  const stuck = agents.find(a => a.state === 'blocked' && now - a.at < 5 * 60_000);
  if (stuck) return { agent: stuck, title: 'AGENT IS STUCK', body: `${stuck.name} hit a snag: ${stuck.activity}`, tone: 'stuck' as const };
  const tired = agents.find(a => moodOfAgent(game, a.key).energy < 18 && ['coding', 'thinking', 'reading', 'testing'].includes(a.state));
  if (tired) return { agent: tired, title: 'RUNNING ON FUMES', body: `${tired.name} has been working a long time and is feeling exhausted!`, tone: 'tired' as const };
  return undefined;
}

/** Increments whenever the value goes up, to replay a bump animation. */
function useBump(value: number) {
  const [bump, setBump] = useState(0);
  const last = useRef(value);
  useEffect(() => { if (value > last.current) setBump(b => b + 1); last.current = value; }, [value]);
  return bump;
}

/** Numbers roll up to their new value like a slot counter. */
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    const step = Math.max(1, Math.ceil(Math.abs(value - shown) / 12));
    const id = setTimeout(() => setShown(s => s < value ? Math.min(value, s + step) : Math.max(value, s - step)), 30);
    return () => clearTimeout(id);
  }, [shown, value]);
  return <>{shown.toLocaleString()}</>;
}

function Face({ agent, lead }: { agent: Agent; lead: boolean }) {
  const url = usePortrait(lookFor(agent, lead).variant);
  return <span className={`hud-face ${agent.provider}`}>{url ? <img src={url} alt="" /> : agent.name[0]}</span>;
}

function NavButton({ icon, label, badge, active, onClick }: { icon: string; label: string; badge?: number; active: boolean; onClick: () => void }) {
  return <button className={`hud-navbtn ${active ? 'on' : ''}`} onClick={() => { play('click'); onClick(); }}>
    <span className="hud-navico">{icon}</span><span>{label}</span>{badge !== undefined && <i>{badge}</i>}
  </button>;
}

function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <aside className="hud-side hud-panel">
    <header><h3>{title}</h3><button onClick={onClose}>×</button></header>
    <div className="hud-side-body">{children}</div>
  </aside>;
}

function RosterRow({ agent, role, game, now, onClick }: { agent: Agent; role: string; game: GameState; now: number; onClick: () => void }) {
  const status = statusOf(agent, moodOf(agent, now));
  const mood = moodOfAgent(game, agent.key);
  return <button className="hud-roster" onClick={onClick}>
    <Face agent={agent} lead={role === 'lead'} />
    <div><b>{role === 'lead' ? '★ ' : role === 'sub' ? '↳ ' : ''}{agent.name} <span>{moodEmoji(mood)}</span></b><small>{agent.task || agent.activity}</small></div>
    <span className={`ta-pill ${status.tone}`}>{status.emoji}</span>
  </button>;
}

function ToastCard({ toast, onClick }: { toast: Toast; onClick: () => void }) {
  return <button className={`hud-toast ${toast.tone}`} onClick={onClick}>
    <span className="hud-toast-icon">{toast.icon}</span>
    <div><b>{toast.title}</b>{toast.detail && <small>{toast.detail}</small>}</div>
    <div className="hud-toast-gain">{toast.stars ? <span>+{toast.stars}⭐</span> : null}{toast.coins ? <span>+{toast.coins}🪙</span> : null}{toast.cosmetic && <em>office life</em>}</div>
  </button>;
}

function AlertCard({ alert, roles, onJump, onCheer, onBreak }: { alert: NonNullable<ReturnType<typeof alertFor>>; roles: Map<string, string>; onJump: () => void; onCheer: () => void; onBreak: () => void }) {
  const url = usePortrait(lookFor(alert.agent, roles.get(alert.agent.key) === 'lead').variant);
  return <div className={`hud-alert hud-panel ${alert.tone}`}>
    <div className="hud-alert-face">{url ? <img src={url} alt="" /> : alert.agent.name[0]}</div>
    <div className="hud-alert-body">
      <h3>⚠ {alert.title}</h3>
      <p>{alert.body}</p>
      <div className="hud-alert-actions">
        <button onClick={onJump}>👀 Jump to</button>
        <button onClick={onCheer}>💗 Cheer up <small>{interactionCost.cheer}🪙</small></button>
        <button onClick={onBreak}>☕ Send break <small>{interactionCost.coffee}🪙</small></button>
      </div>
    </div>
  </div>;
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="hud-meter"><span>{label}</span><div className="hud-bar"><i style={{ width: `${value}%`, background: color }} /></div></div>;
}

function AgentPanel({ agent, agents, roles, now, game, since: from, mood, following, onClose, onFollow, onFocus, onReact }: {
  agent: Agent; agents: Agent[]; roles: Map<string, 'lead' | 'sub' | 'solo'>; now: number; game: GameState; since: number; mood: ReturnType<typeof moodOf>; following: boolean;
  onClose: () => void; onFollow: () => void; onFocus: (key: string) => void; onReact: (kind: Interaction) => void;
}) {
  const status = statusOf(agent, mood);
  const role = roles.get(agent.key);
  const team = agents.filter(a => sameSession(a, agent) && a.key !== agent.key);
  const lead = agents.find(a => sameSession(a, agent) && a.agentId === agent.parentAgentId);
  const h = harness[agent.provider];
  const m = moodOfAgent(game, agent.key);
  const url = usePortrait(lookFor(agent, role === 'lead').variant);
  const hearts = Math.min(5, Math.floor((game.affinity[agent.key] ?? 0) / 2));
  return <aside className="hud-inspector hud-panel">
    <button className="hud-x" onClick={onClose} aria-label="Close">×</button>
    <div className="hud-insp-head">
      <div className={`hud-portrait ${agent.provider}`}>{url ? <img src={url} alt="" /> : agent.name[0]}</div>
      <div>
        <h2>{agent.name} <span>{moodEmoji(m)}</span></h2>
        <p>{role === 'lead' ? '★ Team lead' : role === 'sub' ? '↳ Subagent' : 'Agent'} · <span className={`ta-harness ${agent.provider}`}>{h.glyph} {h.label}</span></p>
        <p className="hud-hearts">{'💗'.repeat(hearts)}{'🤍'.repeat(5 - hearts)}</p>
      </div>
    </div>
    <div className={`ta-state ${status.tone}`}><span>{status.emoji} {status.label}</span><span>{since(now - from)}</span></div>
    <div className="ta-field"><label>Working on</label><p>{agent.task || '—'}</p></div>
    <div className="ta-field"><label>Right now</label><p>{agent.activity}</p></div>
    <div className="ta-field"><label>Project</label><p>{agent.project.name}</p></div>
    <Bar label="⚡ Energy" value={m.energy} color="linear-gradient(90deg,#ffb020,#b6ff3b)" />
    <Bar label="😊 Mood" value={m.happiness} color="linear-gradient(90deg,#ff4fd8,#3ee8ff)" />
    {(lead || team.length > 0) && <div className="ta-field"><label>Team</label>
      <div className="ta-team">
        {lead && <button onClick={() => onFocus(lead.key)}>★ {lead.name}</button>}
        {team.filter(a => a.key !== lead?.key).map(a => <button key={a.key} onClick={() => onFocus(a.key)}>{a.parentAgentId === agent.agentId ? '↳ ' : ''}{a.name}</button>)}
      </div>
    </div>}
    <div className="hud-actions">
      {([['poke', '👉', 'Poke'], ['snack', '🍪', 'Snack'], ['highfive', '✋', 'High-five'], ['cheer', '🎉', 'Cheer'], ['coffee', '☕', 'Coffee']] as const).map(([kind, icon, label]) =>
        <button key={kind} onClick={() => onReact(kind)} disabled={game.coins < interactionCost[kind]}>{icon}<span>{label}</span>{interactionCost[kind] > 0 && <small>{interactionCost[kind]}🪙</small>}</button>)}
    </div>
    <button className={`ta-follow ${following ? 'on' : ''}`} onClick={onFollow}>{following ? '◉ Following' : '◎ Follow with camera'}</button>
    <p className="ta-fine">Just for fun — nothing here reaches the real agent.</p>
  </aside>;
}

function RoomPanel({ room, agents, now, onClose, onFocus, onTheme }: { room: Building['rooms'][number]; agents: Agent[]; now: number; onClose: () => void; onFocus: (key: string) => void; onTheme: (projectId: string, vertical: string) => void }) {
  const title = room.kind === 'project' ? room.project!.name : room.kind[0].toUpperCase() + room.kind.slice(1);
  return <aside className="hud-inspector hud-panel">
    <button className="hud-x" onClick={onClose} aria-label="Close">×</button>
    <div className="hud-insp-head"><div className="hud-portrait" style={{ background: room.kind === 'project' ? projectColor(room.slot).carpet : '#7b5cff' }}>{title[0]}</div>
      <div><h2>{title}</h2><p>{room.kind === 'project' ? `${room.pods.filter(p => p.session).length} sessions` : 'Shared space'}</p></div></div>
    {room.project?.description && <div className="ta-field"><p>{room.project.description}</p></div>}
    {room.project && <div className="ta-field"><label>Room theme</label>
      <select className="hud-select" value={verticalOf(room.project).id} onChange={e => { onTheme(room.project!.id, e.target.value); play('pop'); }}>
        {verticals.map(v => <option key={v.id} value={v.id}>{v.icon} {v.name}</option>)}
      </select>
    </div>}
    {room.pods.filter(p => p.session).map(pod => <div key={pod.id} className="ta-field">
      <label>{harness[pod.session!.provider].glyph} {pod.session!.name}</label>
      <div className="ta-roster">
        {pod.seats.map(seat => {
          const a = agents.find(x => x.key === seat.agent.key) ?? seat.agent;
          const s = statusOf(a, moodOf(a, now));
          return <button key={a.key} onClick={() => onFocus(a.key)}><span>{a.parentAgentId ? '↳ ' : ''}{a.name}</span><span className={`ta-pill ${s.tone}`}>{s.emoji} {s.label}</span></button>;
        })}
      </div>
    </div>)}
  </aside>;
}

