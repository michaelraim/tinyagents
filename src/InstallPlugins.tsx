import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Tabs } from './Modal';

export default function InstallPlugins() {
  const [client, setClient] = useState<'codex' | 'claude'>('codex'), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [system, setSystem] = useState(() => /Windows/i.test(navigator.userAgent) ? 'windows' : 'unix');
  const [updating, setUpdating] = useState(false);
  const runner = system === 'windows' ? 'npx.cmd' : 'npx';
  const cli = client === 'codex' ? `${runner} --yes @openai/codex@0.161.0` : `${runner} --yes --package @anthropic-ai/claude-code claude`;
  const commands = `${cli} plugin marketplace ${updating ? `${client === 'codex' ? 'upgrade' : 'update'} tinyagents` : 'add michaelraim/tinyagents'}\n${cli} plugin ${client === 'codex' ? 'add' : updating ? 'update' : 'install'} sidequest-office@tinyagents${client === 'claude' ? ' --scope user' : ''}`;
  async function copy() { try { await navigator.clipboard.writeText(commands); setCopied(true); setError(''); } catch { setError('Select the commands above and copy them.'); } }
  const app = client === 'codex' ? 'Codex' : 'Claude Code';
  return <div className="ui-install">
    <Tabs label="Choose coding app" value={client} onChange={id => { setClient(id); setCopied(false); }} options={[['codex', '⌘ Codex'], ['claude', '✳ Claude Code']]} />
    <div className="ui-fields-2">
      <label className="ui-field">Your computer<select value={system} onChange={event => { setSystem(event.target.value); setCopied(false); setError(''); }}><option value="windows">Windows</option><option value="unix">macOS / Linux / WSL</option></select></label>
      <label className="ui-field">Plugin<select value={updating ? 'update' : 'install'} onChange={event => { setUpdating(event.target.value === 'update'); setCopied(false); }}><option value="install">First install</option><option value="update">Update</option></select></label>
    </div>
    <ol className="ui-steps">
      <li><div><p>Open {system === 'windows' ? <strong>Windows Terminal</strong> : <strong>Terminal</strong>} and run these two lines. It’s a terminal command, not a chat message.</p>
        <pre className="ui-code"><code>{commands}</code></pre>
        <button className="ui-btn full" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : `Copy ${updating ? 'update' : 'install'} commands`}</button>
        {error && <p className="ui-alert" role="status">{error}</p>}
      </div></li>
      <li><div>{client === 'codex'
        ? <p>Restart Codex and approve the hooks: <strong>Settings → Hooks → sidequest-office</strong> (or <code>/hooks</code> in the CLI). Installing alone doesn’t enable them.</p>
        : <p>Restart Claude Code and enable the plugin’s hooks when asked.</p>}</div></li>
      <li><div><p>In a new chat, ask <strong>“connect tinyAGENTS”</strong> and approve this computer in your browser. Then start a task.</p></div></li>
    </ol>
    <details className="ui-more"><summary>Trouble installing?</summary>
      <p className="ui-note">Requires <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Node.js 22.18+</a>. The commands fetch the official {app} command-line tool, so a separate <code>{client === 'codex' ? 'codex' : 'claude'}</code> command isn’t needed. If <code>{runner}</code> is missing, install Node.js and open a new terminal.</p>
      {client === 'codex' && <p className="ui-note">Versions 0.6.0–0.6.1 could install without hooks: choose Update above, then start a new chat.</p>}
      <p className="ui-note">Use both apps? Install both; they share your office. <a href="/setup.html" target="_blank" rel="noreferrer">Full setup guide ↗</a></p>
    </details>
  </div>;
}
