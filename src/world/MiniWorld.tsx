import { useEffect, useRef, useState } from 'react';
import { applyEvent, type OfficeState } from '../../shared/protocol';
import { createDemo, nextDemoEvent } from '../demo';
import { useLiveWorld } from './useLiveWorld';
import { WorldScene, type CameraCommand } from './WorldScene';
import './world.css';

/** The live demo office in a box, for the homepage. Click someone to hand them a cookie. */
export default function MiniWorld({ night = false }: { night?: boolean }) {
  const [office, setOffice] = useState<OfficeState>(createDemo);
  const [now, setNow] = useState(Date.now);
  const [visible, setVisible] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const tick = useRef(0);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => { setNow(Date.now()); setOffice(o => applyEvent(o, nextDemoEvent(o, tick.current++))); }, 2500);
    return () => clearInterval(timer);
  }, [visible]);
  const { plan, world, agents, roles, stateSince } = useLiveWorld(office, now);
  const [command] = useState<CameraCommand>();
  return <div ref={host} className="ta-mini ta-world-embed">
    <WorldScene plan={plan} world={world} agents={agents} roles={roles} stateSince={stateSince} now={now} daylight={night ? 0 : 1}
      paused={!visible} command={command} showcase
      onSelect={key => key && world.react(key, 'snack', performance.now())}
      onPoke={key => world.react(key, 'poke', performance.now())} onSelectRoom={() => {}} />
  </div>;
}
