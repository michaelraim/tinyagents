/** One place for every colour in the world. */

/** Project carpets, saturated so each room reads from far away (reference: purple, teal, yellow, pink). */
export const projectColors = [
  { carpet: '#8b6cf2', accent: '#6c4fd6', name: 'violet' },
  { carpet: '#25c2a0', accent: '#169a7e', name: 'teal' },
  { carpet: '#f2b630', accent: '#d39410', name: 'sun' },
  { carpet: '#ef6b8a', accent: '#d14a6b', name: 'rose' },
  { carpet: '#3b9cf0', accent: '#2079cc', name: 'sky' },
  { carpet: '#9bd247', accent: '#77ae27', name: 'lime' },
  { carpet: '#f0853c', accent: '#d0651d', name: 'tangerine' },
  { carpet: '#4a5bd8', accent: '#3443b6', name: 'indigo' },
  { carpet: '#e05656', accent: '#bf3a3a', name: 'cherry' },
  { carpet: '#2cb4c9', accent: '#178fa1', name: 'lagoon' },
];
export const projectColor = (slot: number) => projectColors[((slot % projectColors.length) + projectColors.length) % projectColors.length];

export const world = {
  ground: '#26233a',
  groundLine: '#36324f',
  groundLineMajor: '#433e60',
  wall: '#3a3d62',
  wallTop: '#565b8c',
  wallTrim: '#d9d3ca',
  corridor: '#3b3757',
  corridorPlank: '#2e2a47',
  roomFloor: '#7a5a43',
  wood: '#e3c9a0',
  woodDark: '#a87c52',
  deskTop: '#efdcbc',
  deskLeg: '#6b5440',
  metal: '#3a3d46',
  screen: '#22252e',
  screenGlow: '#8fd3ff',
  plantPot: '#c97b52',
  plant: '#5bb35a',
  plantDark: '#3f9046',
  chairs: ['#f4efe6', '#e8b48a', '#b9cfae', '#f4efe6'],
  sofa: '#e2a77c',
  sofaAlt: '#9fbfae',
  glass: '#bfe3f0',
};

export const harness = {
  claude: { shirt: '#d97757', trim: '#f7c9b4', label: 'Claude Code', glyph: '✳' },
  codex: { shirt: '#2a2c33', trim: '#ffffff', label: 'Codex', glyph: '⌘' },
} as const;


/** Brand neon (night-shift arcade). */
export const neon = { pink: '#ff4fd8', cyan: '#3ee8ff', lime: '#b6ff3b', gold: '#ffd23f', violet: '#9b6bff', ink: '#120f26', panel: '#1b1838' };

export const states = {
  work: '#46c38a',
  think: '#9a7cf0',
  ask: '#ffb020',
  stuck: '#ff5d5d',
  done: '#7bd24a',
  idle: '#9aa3b2',
  away: '#6b7280',
};
