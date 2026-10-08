import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function InstallPlugins() {
  const [client, setClient] = useState<'codex' | 'claude'>('codex'), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [system, setSystem] = useState(() => /Windows/i.test(navigator.userAgent) ? 'windows' : 'unix');
  const [updating, setUpdating] = useState(false);
  const runner = system === 'windows' ? 'npx.cmd' : 'npx';
  const cli = client === 'codex' ? `${runner} --yes @openai/codex@0.161.0` : `${runner} --yes --package @anthropic-ai/claude-code claude`;
  const commands = `${cli} plugin marketplace ${updating ? `${client === 'codex' ? 'upgrade' : 'update'} tinyagents` : 'add michaelraim/tinyagents'}\n${cli} plugin ${client === 'codex' ? 'add' : updating ? 'update' : 'install'} sidequest-office@tinyagents${client === 'claude' ? ' --scope user' : ''}`;
  async function copy() { try { await navigator.clipboard.writeText(commands); setCopied(true); setError(''); } catch { setError('Select the commands above and copy them.'); } }
  return <div className="install-plugins">
    <div className="install-choice" aria-label="Choose coding app">{(['codex', 'claude'] as const).map(id => <button key={id} aria-pressed={id === client} onClick={() => { setClient(id); setCopied(false); }}>{id === 'codex' ? '⌘ Codex' : '✳ Claude Code'}</button>)}</div>
    <label className="install-system">Your computer<select value={system} onChange={event => { setSystem(event.target.value); setCopied(false); setError(''); }}><option value="windows">Windows</option><option value="unix">macOS / Linux / WSL</option></select></label>
    <label className="install-system">Plugin<select value={updating ? 'update' : 'install'} onChange={event => { setUpdating(event.target.value === 'update'); setCopied(false); }}><option value="install">First installation</option><option value="update">Already installed — update</option></select></label>
    <p>{system === 'windows' ? <>Open <strong>Windows Terminal</strong> or <strong>Command Prompt</strong>. Paste these two lines and press Enter.</> : <>Open <strong>Terminal</strong>. Paste these two lines and press Enter.</>} This is a terminal command, not a chat message.</p>
    <pre><code>{commands}</code></pre>
    <button className="secondary full" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : `Copy ${updating ? 'update' : 'install'} commands`}</button>
    {error && <p role="status">{error}</p>}
    <p className="install-note">Requires <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Node.js 22.18+</a>. These commands download the official command-line tools automatically; a separate <code>{client === 'codex' ? 'codex' : 'claude'}</code> command is not required.</p>
    <details className="install-help"><summary>“Command not recognized”?</summary><p>The desktop app and its terminal command are separate. Use the commands above instead of starting with <code>{client === 'codex' ? 'codex' : 'claude'}</code>. If <code>{runner}</code> is also missing, install Node.js, close this terminal, open a new one, and retry.</p></details>
    {client === 'codex' ? <><p><strong>Restart Codex, then review the tinyAGENTS hooks.</strong> Installing the plugin does not approve them. Open <strong>Settings → Hooks</strong>, select <strong>sidequest-office</strong> and review its hooks. In the CLI, type <code>/hooks</code> instead.</p><p className="install-note">Versions 0.6.0–0.6.1 could install without loading any hooks. Choose “Already installed — update” above to get the fixed package. Then start a new chat.</p></> : <p><strong>Restart Claude Code and enable its hooks.</strong> Start a new session.</p>}
    <p>Ask <strong>“connect tinyAGENTS”</strong>. Approve this computer in your browser, then start a task. The website confirms receipt when real activity arrives.</p>
    <p className="install-note">Use both? Install both. They share your office automatically. Browser didn’t open? Ask your agent <strong>“connect tinyAGENTS”</strong>.</p>
    <a href="/setup.html" target="_blank" rel="noreferrer">Setup help & updates ↗</a>
  </div>;
}
