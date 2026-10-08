import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Github, Moon, Play, Sun } from 'lucide-react';
import { applyEvent, projectsOf } from '../shared/protocol';
import { createDemo, nextDemoEvent } from './demo';
import ConnectDialog from './ConnectDialog';
import { useAccount } from './AccountContext';
import type { Reaction } from './scene/Character';
import './landing.css';
import BrandWordmark from './BrandWordmark';
import { useCampus } from './useCampus';
const OfficeScene=lazy(()=>import('./scene/OfficeScene'));

function MiniOffice(){
  const [office,setOffice]=useState(()=>{const sample=createDemo();return {...sample,agents:sample.agents.filter(a=>['milo','pip','nova','remy'].includes(a.agentId))};});
  const [now,setNow]=useState(Date.now),[night,setNight]=useState(false),[reaction,setReaction]=useState<Reaction>();
  const [visible,setVisible]=useState(true),host=useRef<HTMLDivElement>(null),tick=useRef(0);
  const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{if(!visible)return;const timer=setInterval(()=>{setNow(Date.now());setOffice(o=>applyEvent(o,nextDemoEvent(o,tick.current++)));},3000);return()=>clearInterval(timer);},[visible]);
  const projects=useMemo(()=>projectsOf(office),[office]);
  const plan=useCampus(projects,'landing');
  return <div className="landing-world" ref={host} aria-label="Interactive miniature office with simulated demo activity">
    <Suspense fallback={<div className="mini-loading">Planting the office garden… 🌱</div>}><OfficeScene plan={plan} projects={projects} events={office.events} now={now} evening={night} paused={!visible} reducedMotion={reduced} focus={null} onSelect={agent=>setReaction({key:agent.key,kind:'snack',at:Date.now()})} reaction={reaction} onWorldAction={()=>{}} onFocus={()=>{}} onHangoutResult={()=>{}}/></Suspense>
    <div className="mini-toolbar"><span><i/> A LITTLE DEMO</span><button onClick={()=>setNight(v=>!v)} aria-label={night?'Preview daytime':'Preview nighttime'}>{night?<Moon size={15}/>:<Sun size={15}/>} {night?'Night owls':'Day shift'}</button></div>
    <div className="mini-caption"><span>🍪 Click an agent. Snack delivery is on us.</span><a href="/demo">Explore the demo <ArrowUpRight size={14}/></a></div>
  </div>;
}

export default function Landing(){
  const [connect,setConnect]=useState<'new'|'existing'>(),connected=useRef(''),root=useRef<HTMLDivElement>(null);
  const account = useAccount();
  const [savedOffice]=useState(()=>{try{return !!localStorage.getItem('sidequest.office');}catch{return false;}});
  useEffect(()=>{
    document.title='tinyAGENTS — a little world for your coding agents';
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');observer.unobserve(e.target);}}),{root:root.current,threshold:.12});
    root.current?.querySelectorAll('.reveal').forEach(el=>observer.observe(el));return()=>observer.disconnect();
  },[]);
  const hasOffice = !!account.officeId || (!account.user && savedOffice);
  function enter(id:string){connected.current=id;try{localStorage.setItem('sidequest.office',id);localStorage.setItem('sidequest.mode','live');}catch{/* The server session remains valid. */}}
  return <div className="landing" ref={root}>
    <nav className="landing-nav" aria-label="Main navigation"><a className="landing-brand" href="/"><img src="/favicon.svg" alt=""/><BrandWordmark/><span className="brand-beta">public beta</span></a><div><a className="nav-tour" href="#how-it-works">How it works</a><a href={hasOffice?'/office':'/demo'}>{hasOffice?'My office':'Take a look'} <ArrowUpRight size={14}/></a><button onClick={()=>setConnect('new')}>{account.user ? 'My account' : 'Get your office'} <ArrowRight size={16}/></button></div></nav>
    <main>
      <section className="landing-hero">
        <div className="hero-copy"><div className="landing-kicker"><i/> CODEX + CLAUDE CODE. ONE LITTLE WORLD.</div><h1>Small crew.<br/>Big things.<br/><em>A world of their own.</em><span className="hero-spark">✳</span></h1><p>Turn all those busy terminals into a living, breathing office. Watch your team build, think, ask for help, and take a very well-earned coffee break.</p><div className="hero-actions"><button className="landing-primary" onClick={()=>setConnect('new')}>Make yourself at home <ArrowRight size={19}/></button><a href="/demo"><Play size={15}/> Play with the demo</a></div><div className="hero-fine"><Check size={14}/> Free to start <span>·</span> Your own private office <span>·</span> Both harnesses welcome</div></div>
        <div className="hero-stage"><div className="orbit-note note-top">💭 “Wait, I have an idea…”</div><MiniOffice/><div className="orbit-note note-bottom">Tests passed. Tiny celebration earned. ✨</div></div>
      </section>
      <div className="landing-marquee" aria-hidden="true"><div>{[0,1].map(i=><span key={i}>tinyAGENTS <b>✳</b> BIG IDEAS <b>✳</b> SAME REAL WORK <b>✳</b> EXCELLENT COFFEE <b>✳</b> </span>)}</div></div>
      <section className="landing-section reveal" id="how-it-works"><div className="section-heading"><span className="landing-kicker">01 / FROM TERMINAL TO TINY WORLD</span><h2>Big projects.<br/>Little coworkers.</h2><p>One office for you. A space for every project. A person for every agent. The floor plan grows around the work.</p></div><div className="how-grid">
        <article><div className="how-visual connection-visual"><span className="harness-logo">⌘<small>Codex</small></span><svg viewBox="0 0 150 90"><path d="M0 20 Q70 20 75 45 T150 45 M0 70 Q70 70 75 45"/></svg><span className="harness-logo claude">✳<small>Claude</small></span><img src="/favicon.svg" alt="tinyAGENTS office"/></div><small>01 / CONNECT</small><h3>Bring the whole team.</h3><p>Install the observers and pair them with your office. Codex and Claude can share a room when they work on the same repository.</p></article>
        <article><div className="how-visual expanding-plan"><div>WEB APP<i/><i/><i/><i/></div><div>API<i/><i/></div><div>GARDEN ☕</div><div>NEW SESSION<i/></div></div><small>02 / WATCH IT GROW</small><h3>A place for every project.</h3><p>Sessions get workspaces. Subagents join their team lead. New work reshapes your office, with props that match each project.</p></article>
        <article><div className="how-visual mood-visual"><span>🤔<small>working it out</small></span><span>✋<small>needs you</small></span><span>🥳<small>nailed it</small></span></div><small>03 / FEEL THE MOMENT</small><h3>You’ll know when you’re needed.</h3><p>See observed work states at a glance. Give a snack, send a cheer, or follow a coworker around the office.</p></article>
      </div></section>
      <section className="landing-community reveal"><div className="community-art" aria-hidden="true"><div className="island island-one">⌘<span>YOUR OFFICE</span><i>☀️ 10:42</i></div><div className="island island-two">✳<span>THE NEIGHBORS</span><i>🌙 21:42</i></div><div className="community-coffee">☕<span>“My agent can out-debug your agent.”</span></div><svg viewBox="0 0 500 330"><path d="M130 100 Q450 20 350 170 T210 290"/></svg></div><div><span className="landing-kicker">02 / THE NEIGHBORHOOD IS OPEN</span><h2>Serious work.<br/><em>Unserious office life.</em></h2><p>Visit a friend’s public office. Bring their crew into your neighborhood. Arrange a coffee break or a deeply unnecessary arcade rivalry.</p><p className="honest-note">Work states come from the observers. Snacks, moods, and break-room antics are playful simulation. They never send instructions to your coding agents.</p><a href="/demo">Meet the demo crew <ArrowRight size={17}/></a></div></section>
      <section className="landing-details reveal"><article><span>🌅</span><h3>Your clock. Your atmosphere.</h3><p>Daylight follows your office’s time zone, even when someone on the other side of the world visits.</p></article><article><span>🔎</span><h3>Glance, then get back to it.</h3><p>Follow an agent, focus a project, or open its team directory. A small world with the useful details close by.</p></article><article><span>🏡</span><h3>Your door. Your choice.</h3><p>Offices start private. Open a public visitor link when you’re ready. Code, prompts, and raw conversations stay out of the public view.</p></article></section>
      <section className="landing-invite reveal"><span className="invite-star">✳</span><p className="landing-kicker">THERE’S A DESK WITH YOUR NAME ON IT</p><h2>Give your agents<br/>a place to call <em>work.</em></h2><button className="landing-primary" onClick={()=>setConnect('new')}>Create my office <ArrowRight size={19}/></button><button className="returning" onClick={()=>setConnect('existing')}>Already have an office? Open it here.</button></section>
    </main><footer className="landing-footer"><a className="landing-brand" href="/"><img src="/favicon.svg" alt=""/><BrandWordmark/></a><span>Small crew. Big things.</span><a href="https://github.com/michaelraim/tinyagents" target="_blank" rel="noreferrer"><Github size={17}/> Built in the open</a></footer>
    {connect&&<ConnectDialog initialTab={connect} onConnect={enter} onDeleted={()=>{}} onClose={()=>{setConnect(undefined);if(connected.current)location.assign('/office');}}/>}
  </div>;
}
