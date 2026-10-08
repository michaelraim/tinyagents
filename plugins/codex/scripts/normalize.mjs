import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const id = value => hash(String(value));
const names = ['Milo', 'Cleo', 'Pip', 'Nova', 'Atlas', 'Bean', 'Luna', 'Fern', 'Chip', 'Sage', 'Remy', 'Wren'];
const allowedTools = /^(Bash|Read|Write|Edit|Glob|Grep|Agent|Task|WebSearch|WebFetch|apply_patch|exec_command|spawn_agent|update_plan|functions[._].*|mcp__.*)$/;

/** Normalize on the user's machine. No raw prompt, path, command, or result crosses the wire. */
export function normalizeHook(raw, provider, config = {}, now = Date.now()) {
  if (!['codex', 'claude'].includes(provider) || !raw || typeof raw.session_id !== 'string') return null;
  const hook = raw.hook_event_name;
  const cwd = typeof raw.cwd === 'string' ? raw.cwd.replace(/\\/g, '/') : 'unknown-project';
  const projectId = id(config.projectId || (/^[a-zA-Z]:\//.test(cwd) ? cwd.toLowerCase() : cwd));
  const sessionId = id(raw.session_id);
  const agentId = raw.agent_id ? id(raw.agent_id) : sessionId;
  let state, activity, phase = 'state';
  const tool = typeof raw.tool_name === 'string' && allowedTools.test(raw.tool_name) ? raw.tool_name.slice(0, 80) : 'Tool';
  switch (hook) {
    case 'SessionStart': state = 'idle'; activity = 'Arrived at the office'; break;
    case 'UserPromptSubmit': state = 'thinking'; activity = 'Thinking through a new request'; break;
    case 'PreToolUse': {
      const name = tool.toLowerCase();
      // Classify a command locally, never transmit the command itself.
      const command = String(raw.tool_input?.command ?? raw.tool_input?.cmd ?? '');
      const isTest = /(?:^|[\s;&|])(test|pytest|vitest|jest|playwright|cargo test|go test)(?:\s|$)|npm (run )?test|pnpm (run )?test/.test(command);
      state = isTest ? 'testing' : /read|grep|glob|search|fetch/.test(name) ? 'reading' : /write|edit|patch|bash|exec/.test(name) ? 'coding' : 'thinking';
      activity = state === 'testing' ? 'Running checks' : state === 'reading' ? 'Exploring the project' : state === 'coding' ? 'Working with tools' : 'Coordinating the next step';
      phase = 'start'; break;
    }
    case 'PostToolUse': state = 'thinking'; activity = 'Considering the tool result'; phase = 'finish'; break;
    case 'PostToolUseFailure': state = 'blocked'; activity = 'A tool hit a snag'; phase = 'finish'; break;
    case 'PermissionRequest': state = 'waiting'; activity = 'Needs your permission to continue'; break;
    case 'Notification':
      if (raw.notification_type === 'permission_prompt') { state = 'waiting'; activity = 'Needs your permission to continue'; }
      else if (raw.notification_type === 'idle_prompt') { state = 'idle'; activity = 'Ready for the next request'; }
      else return null;
      break;
    case 'SubagentStart': state = 'thinking'; activity = 'Joined the team'; break;
    case 'SubagentStop': state = 'done'; activity = 'Finished responding to the lead'; break;
    case 'Stop': state = 'done'; activity = 'Finished this turn'; break;
    case 'Interrupt': state = 'idle'; activity = 'Paused by the human'; break;
    case 'SessionEnd': state = 'offline'; activity = 'Left the office'; break;
    case 'PreCompact': state = 'thinking'; activity = 'Tidying up the context'; break;
    case 'PostCompact': state = 'thinking'; activity = 'Picking up the thread'; break;
    default: return null;
  }
  return {
    version: 1, id: randomUUID(), at: now, provider,
    project: { id: projectId, name: (config.projectName || path.posix.basename(cwd) || 'My project').slice(0, 60), theme: ['studio', 'lab', 'garden'].includes(config.theme) ? config.theme : 'studio' },
    sessionId, agentId,
    ...(raw.agent_id ? { parentAgentId: raw.parent_agent_id ? id(raw.parent_agent_id) : sessionId } : {}),
    name: names[parseInt(agentId.slice(0, 4), 16) % names.length], state, activity, phase,
    ...(raw.tool_name ? { tool } : {}),
    ...(raw.tool_use_id ? { toolCallId: id(raw.tool_use_id) } : {}),
    ...(typeof config.taskLabel === 'string' && config.taskLabel ? { task: config.taskLabel.slice(0, 180) } : {}),
  };
}
