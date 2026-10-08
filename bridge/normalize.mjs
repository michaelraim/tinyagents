import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const id = value => hash(String(value));
const names = ['Milo', 'Cleo', 'Pip', 'Nova', 'Atlas', 'Bean', 'Luna', 'Fern', 'Chip', 'Sage', 'Remy', 'Wren', 'Juno', 'Otto', 'Ivy', 'Kai', 'Rue', 'Bo', 'Zuri', 'Moss', 'Tilly', 'Ezra', 'Pax', 'Lumi'];
const allowedTools = /^(Bash|BashOutput|Read|Write|Edit|MultiEdit|NotebookEdit|Glob|Grep|Agent|Task|TodoWrite|Skill|WebSearch|WebFetch|apply_patch|exec_command|shell|spawn_agent|SendMessage|send_input|send_message|followup_task|update_plan|functions[._].*|mcp__.*)$/;

// Commands whose first word (and subcommand) are safe and informative to show.
const toolsWithSubcommands = new Set(['git', 'npm', 'pnpm', 'yarn', 'npx', 'bun', 'deno', 'cargo', 'go', 'docker', 'kubectl', 'make', 'pip', 'uv', 'poetry', 'dotnet', 'gradle', 'mvn', 'terraform', 'gh', 'wrangler', 'vercel']);

/** Strip anything that looks like a secret, address or long identifier. */
function scrub(text) {
  return text
    .replace(/https?:\/\/([^/\s]+)\S*/g, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '•••')
    .replace(/\b[A-Za-z0-9_\-]{28,}\b/g, '•••')
    .replace(/\b(?:sk|pk|ghp|gho|xox[abp]|cfat|AKIA)[-_A-Za-z0-9]{6,}/g, '•••');
}

/** A short, human title from a prompt: first sentence or ~80 characters, no code. */
export function titleFrom(text, limit = 80) {
  if (typeof text !== 'string') return undefined;
  let t = text.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/<[^>]{1,40}>/g, ' ');
  t = scrub(t).replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  const sentence = t.match(/^(.{12,}?[.!?])(\s|$)/);
  if (sentence && sentence[1].length <= limit + 10) t = sentence[1];
  if (t.length > limit) t = `${t.slice(0, limit).replace(/\s+\S*$/, '')}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const base = file => typeof file === 'string' && file ? path.posix.basename(file.replace(/\\/g, '/')).slice(0, 48) : undefined;
const quote = (text, n) => typeof text === 'string' && text.trim() ? `“${scrub(text.trim()).slice(0, n)}${text.trim().length > n ? '…' : ''}”` : '';

function commandVerb(command) {
  const words = command.trim().replace(/^(sudo|env|time)\s+/, '').split(/\s+/);
  const first = base(words[0]?.replace(/^["']|["']$/g, '')) ?? '';
  if (!/^[\w.+-]{1,32}$/.test(first)) return undefined;
  const sub = words[1];
  if (toolsWithSubcommands.has(first) && sub && /^[a-z][\w:-]{0,24}$/.test(sub)) return `${first} ${sub}${sub === 'run' && /^[\w:-]{1,24}$/.test(words[2] ?? '') ? ` ${words[2]}` : ''}`;
  return first;
}

/** First file named in a patch body (Codex apply_patch). */
function patchFile(input) {
  const body = typeof input === 'string' ? input : input?.input ?? input?.patch;
  const match = typeof body === 'string' ? body.match(/\*\*\* (?:Update|Add|Delete) File: (.+)/) : null;
  return match ? base(match[1].trim()) : undefined;
}

/** What the agent is concretely doing, from tool metadata only. Never includes arguments beyond a name. */
export function describeTool(tool, input = {}, state) {
  const name = String(tool);
  if (state === 'testing') {
    const verb = commandVerb(String(input.command ?? input.cmd ?? ''));
    return verb ? `Running tests (${verb})` : 'Running the tests';
  }
  if (/^(Read)$/.test(name)) return base(input.file_path) ? `Reading ${base(input.file_path)}` : undefined;
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(name)) return base(input.file_path ?? input.notebook_path) ? `${name === 'Write' ? 'Writing' : 'Editing'} ${base(input.file_path ?? input.notebook_path)}` : undefined;
  if (/apply_patch/.test(name)) return patchFile(input) ? `Editing ${patchFile(input)}` : 'Applying a patch';
  if (/^Grep$/.test(name)) return `Searching for ${quote(input.pattern, 32)}`;
  if (/^Glob$/.test(name)) return `Looking for ${quote(input.pattern, 32)}`;
  if (/^(Bash|exec_command|shell|functions[._](exec_command|shell))$/.test(name)) {
    const raw = input.command ?? input.cmd;
    const verb = commandVerb(Array.isArray(raw) ? raw.join(' ') : String(raw ?? ''));
    return verb ? `Running ${verb}` : undefined;
  }
  if (/^WebFetch$/.test(name)) { try { return `Browsing ${new URL(input.url).hostname}`; } catch { return 'Browsing the web'; } }
  if (/^WebSearch$/.test(name)) return `Searching the web for ${quote(input.query, 40)}`;
  if (/^(Task|Agent|spawn_agent)$/.test(name)) return `Briefing a teammate${delegation(input) ? `: ${delegation(input)}` : ''}`;
  if (/^(TodoWrite|update_plan)$/.test(name)) return 'Updating the plan';
  if (/^Skill$/.test(name)) return 'Using a skill';
  const mcp = name.match(/^mcp__([^_]+(?:_[^_]+)*)__/);
  if (mcp) return `Using ${mcp[1].replace(/[-_]/g, ' ').slice(0, 30)}`;
  return undefined;
}

/** The task description a lead hands to a subagent. */
export function delegation(input = {}) {
  return titleFrom(input.description ?? input.task ?? input.message ?? input.prompt, 60);
}

/**
 * Normalize on the user's machine.
 * By default it shares short task titles (first sentence of a prompt), file *names* and
 * command *verbs* so the office can show what each agent is doing. Set `shareTasks: false`
 * in the config to send only generic activity. Code, file contents, command arguments,
 * tool output and full prompts never leave the machine.
 */
export function normalizeHook(raw, provider, config = {}, now = Date.now(), context = {}) {
  if (!['codex', 'claude'].includes(provider) || !raw || typeof raw.session_id !== 'string') return null;
  const share = config.shareTasks !== false;
  const hook = raw.hook_event_name;
  const cwd = typeof raw.cwd === 'string' ? raw.cwd.replace(/\\/g, '/') : 'unknown-project';
  const projectId = id(config.projectId || (/^[a-zA-Z]:\//.test(cwd) ? cwd.toLowerCase() : cwd));
  const sessionId = id(raw.session_id);
  const agentId = raw.agent_id ? id(raw.agent_id) : sessionId;
  let state, activity, phase = 'state', task;
  const tool = typeof raw.tool_name === 'string' && allowedTools.test(raw.tool_name) ? raw.tool_name.slice(0, 80) : 'Tool';
  switch (hook) {
    case 'SessionStart': state = 'idle'; activity = 'Arrived at the office'; break;
    case 'UserPromptSubmit':
      state = 'thinking'; activity = 'Thinking through a new request';
      if (share) task = titleFrom(raw.prompt ?? raw.user_prompt ?? raw.input);
      break;
    case 'PreToolUse': {
      const name = tool.toLowerCase();
      // Classify a command locally; only its verb is ever transmitted.
      const command = String(raw.tool_input?.command ?? raw.tool_input?.cmd ?? '');
      const isTest = /(?:^|[\s;&|])(test|pytest|vitest|jest|playwright|cargo test|go test|rspec|phpunit|mocha)(?:\s|$)|(npm|pnpm|yarn|bun) (run )?test/.test(command);
      state = isTest ? 'testing' : /read|grep|glob|search|fetch/.test(name) ? 'reading' : /write|edit|patch|bash|exec|shell|notebook/.test(name) ? 'coding' : 'thinking';
      activity = state === 'testing' ? 'Running checks' : state === 'reading' ? 'Exploring the project' : state === 'coding' ? 'Working with tools' : 'Coordinating the next step';
      if (share) activity = describeTool(tool, raw.tool_input ?? {}, state) ?? activity;
      phase = 'start'; break;
    }
    case 'PostToolUse': state = 'thinking'; activity = 'Considering the result'; phase = 'finish'; break;
    case 'PostToolUseFailure': state = 'blocked'; activity = 'A tool hit a snag'; phase = 'finish'; break;
    case 'PermissionRequest': state = 'waiting'; activity = share && raw.tool_name ? `Needs your OK to use ${tool}` : 'Needs your permission to continue'; break;
    case 'Notification':
      if (raw.notification_type === 'permission_prompt') { state = 'waiting'; activity = 'Needs your permission to continue'; }
      else if (raw.notification_type === 'idle_prompt') { state = 'idle'; activity = 'Ready for the next request'; }
      else return null;
      break;
    case 'SubagentStart':
      state = 'thinking'; activity = 'Joined the team';
      if (share) task = context.delegation ?? (typeof raw.agent_type === 'string' ? titleFrom(`${raw.agent_type} work`) : undefined);
      break;
    case 'SubagentStop': state = 'done'; activity = 'Reported back to the lead'; break;
    case 'Stop': state = 'done'; activity = 'Finished this turn'; break;
    case 'Interrupt': state = 'idle'; activity = 'Paused by the human'; break;
    case 'SessionEnd': state = 'offline'; activity = 'Left the office'; break;
    case 'PreCompact': state = 'thinking'; activity = 'Tidying up their notes'; break;
    case 'PostCompact': state = 'thinking'; activity = 'Picking up the thread'; break;
    default: return null;
  }
  const parentId = raw.parent_agent_id ? id(raw.parent_agent_id) : sessionId;
  const target = raw.tool_input?.recipient_agent_id ?? raw.tool_input?.agent_id ?? raw.tool_input?.id ?? raw.tool_input?.target;
  const isMessage = hook === 'PreToolUse' && /^(?:functions[._])?(?:SendMessage|send_message|send_input|followup_task)$/.test(tool);
  const collaboration = raw.agent_id && ['SubagentStart', 'SubagentStop'].includes(hook) ? { kind: hook === 'SubagentStart' ? 'delegate' : 'return', targetAgentId: parentId } : isMessage && typeof target === 'string' && target.length <= 160 ? { kind: 'message', targetAgentId: id(target) } : undefined;
  let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try { if (typeof config.timeZone === 'string') { new Intl.DateTimeFormat('en', { timeZone: config.timeZone }).format(); timeZone = config.timeZone; } } catch { /* Keep the machine's valid time zone. */ }
  const label = typeof config.taskLabel === 'string' && config.taskLabel ? config.taskLabel : undefined;
  return {
    version: 1, id: randomUUID(), at: now, provider, timeZone,
    ...(collaboration ? { collaboration } : {}),
    ...(config.instanceId ? { instanceId: id(config.instanceId) } : {}),
    project: { id: projectId, name: (config.projectName || path.posix.basename(cwd) || 'My project').slice(0, 60), theme: ['studio', 'lab', 'garden'].includes(config.theme) ? config.theme : 'studio',
      ...(config.projectIdentity ? { identity: config.projectIdentity } : {}),
      ...(typeof config.vertical === 'string' && /^[a-z-]{1,50}$/.test(config.vertical) ? { vertical: config.vertical } : {}),
      ...(typeof config.projectDescription === 'string' ? { description: config.projectDescription.slice(0, 180) } : {}) },
    sessionId, agentId,
    ...(raw.agent_id ? { parentAgentId: parentId } : {}),
    name: names[parseInt(agentId.slice(0, 4), 16) % names.length], state, activity: activity.slice(0, 140), phase,
    ...(raw.tool_name ? { tool } : {}),
    ...(raw.tool_use_id ? { toolCallId: id(raw.tool_use_id) } : {}),
    ...((task ?? label) ? { task: (task ?? label).slice(0, 180) } : {}),
  };
}
