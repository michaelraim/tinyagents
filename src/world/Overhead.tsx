import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import type { Agent } from '../../shared/protocol';
import type { World, Mood } from './sim';
import { harness } from './palette';

const Z_SELECTED = [30, 0], Z_NORMAL = [10, 0];
const HTML_STYLE = { pointerEvents: 'none' } as const;

export type Status = { label: string; tone: 'work' | 'think' | 'ask' | 'stuck' | 'done' | 'idle' | 'away'; emoji: string };

export function statusOf(agent: Agent, mood: Mood): Status {
  if (mood === 'leave') return { label: agent.state === 'offline' ? 'Signed off' : 'Gone home', tone: 'away', emoji: agent.state === 'offline' ? '👋' : '🏠' };
  if (mood === 'doze') return { label: 'No signal', tone: 'away', emoji: '💤' };
  switch (agent.state) {
    case 'coding': return { label: 'Coding', tone: 'work', emoji: '⌨️' };
    case 'thinking': return { label: 'Thinking', tone: 'think', emoji: '💭' };
    case 'reading': return { label: 'Exploring', tone: 'work', emoji: '🔎' };
    case 'testing': return { label: 'Testing', tone: 'work', emoji: '🧪' };
    case 'waiting': return { label: 'Needs you', tone: 'ask', emoji: '✋' };
    case 'blocked': return { label: 'Stuck', tone: 'stuck', emoji: '😤' };
    case 'done': return { label: 'Done', tone: 'done', emoji: '✨' };
    case 'idle': return { label: 'On a break', tone: 'idle', emoji: '☕' };
    default: return { label: 'Away', tone: 'away', emoji: '🌙' };
  }
}

export function since(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Follows a person around; shows their speech bubble and task card. */
export function Overhead({ agent, world, role, selected, stateSince, now, onSelect }: {
  agent: Agent; world: World; role: 'lead' | 'sub' | 'solo'; selected: boolean; stateSince: number; now: number; onSelect: (key: string) => void;
}) {
  const group = useRef<Group>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const lastBubble = useRef('');

  useFrame(() => {
    const b = world.bodies.get(agent.key);
    if (!b || !group.current) return;
    group.current.position.set(b.x, b.phase === 'seated' ? 1.75 : 1.95, b.z);
    group.current.visible = b.phase !== 'gone';
    const text = b.bubble ? `${b.bubble.tone}|${b.bubble.text}|${b.bubble.at}` : '';
    if (text !== lastBubble.current && bubble.current) {
      lastBubble.current = text;
      bubble.current.textContent = b.bubble?.text ?? '';
      bubble.current.className = `ta-bubble ${b.bubble ? `show ${b.bubble.tone}` : ''}`;
    }
    if (card.current) card.current.dataset.hidden = b.phase === 'gone' ? 'true' : 'false';
  });

  const mood = world.bodies.get(agent.key)?.mood ?? 'work';
  const status = statusOf(agent, mood);
  const task = agent.task || agent.activity;
  useEffect(() => { lastBubble.current = ''; }, [agent.key]);

  return <group ref={group}>
    <Html center zIndexRange={selected ? Z_SELECTED : Z_NORMAL} style={HTML_STYLE}>
      <div className={`ta-over ${selected ? 'selected' : ''} tone-${status.tone}`}>
        <div ref={bubble} className="ta-bubble" />
        <div ref={card} className="ta-card" onClick={() => onSelect(agent.key)} style={{ pointerEvents: 'auto' }}>
          <div className="ta-card-top">
            <span className="ta-name">{role === 'lead' ? '★ ' : role === 'sub' ? '↳ ' : ''}{agent.name}</span>
            <span className={`ta-pill ${status.tone}`}>{status.label} {since(now - stateSince)}</span>
          </div>
          <div className="ta-task">{task}</div>
          <div className="ta-meta">
            <span className={`ta-harness ${agent.provider}`}>{harness[agent.provider].glyph} {harness[agent.provider].label}</span>
            {agent.tool && status.tone !== 'idle' && <span className="ta-tool">{agent.tool}</span>}
          </div>
        </div>
        <div className="ta-dot">{status.emoji}</div>
      </div>
    </Html>
  </group>;
}
