import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const commands = {
  codex: 'codex plugin marketplace add michaelraim/tinyagents\ncodex plugin add sidequest-office@tinyagents',
  claude: 'claude plugin marketplace add michaelraim/tinyagents\nclaude plugin install sidequest-office@tinyagents --scope user',
};
export default function InstallPlugins() {
  const [client, setClient] = useState<'codex' | 'claude'>('codex'), [copied, setCopied] = useState(false), [error, setError] = useState('');
  async function copy() { try { await navigator.clipboard.writeText(commands[client]); setCopied(true); setError(''); } catch { setError('Select the commands above and copy them.'); } }
  return <div className="install-plugins">
    <div className="install-choice" aria-label="Choose coding app">{(['codex', 'claude'] as const).map(id => <button key={id} aria-pressed={id === client} onClick={() => { setClient(id); setCopied(false); }}>{id === 'codex' ? '⌘ Codex' : '✳ Claude Code'}</button>)}</div>
    <p>Run once in your terminal to install the plugin:</p>
    <pre><code>{commands[client]}</code></pre>
    <button className="secondary full" onClick={() => void copy()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied' : 'Copy install commands'}</button>
    {error && <p role="status">{error}</p>}
    <p><strong>Restart {client === 'codex' ? 'Codex' : 'Claude Code'} and enable its hooks.</strong> Start a session. Your browser opens to connect this computer.</p>
    <p className="install-note">Use both? Install both. They share your office automatically. Browser didn’t open? Ask your agent <strong>“connect tinyAGENTS”</strong>.</p>
    <a href="/setup.html" target="_blank" rel="noreferrer">Setup help & updates ↗</a>
  </div>;
}
