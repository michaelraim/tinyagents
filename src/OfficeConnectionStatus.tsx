import { useState } from 'react';
import { Plug, X } from 'lucide-react';

export function FeedStatus({ connection, hasReports }: { connection: string; hasReports: boolean }) {
  const live = connection === 'Live view';
  return <span className="feed-status" title="This is the website’s live feed. Coding app activity is verified separately.">
    <span><i className={live ? 'feed-online' : ''}/>{connection}</span>
    {live && !hasReports && <small>Waiting for agents</small>}
  </span>;
}

export default function EmptyOfficeNotice({ connection, onHelp }: { connection: string; onHelp: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const live = connection === 'Live view';
  return <aside className="arrival-notice glass" aria-label="Agent reporting status">
    <button className="arrival-dismiss" aria-label="Dismiss waiting notice" onClick={() => setDismissed(true)}><X size={15}/></button>
    <span aria-hidden="true">📬</span><div><strong>{live ? 'Waiting for your first agent' : 'Opening your office feed'}</strong>
      <p>{live ? 'The website is live. No agent activity has arrived in this office yet. Already installed? Check hook review and the office ID.' : connection + '. Your agents will appear when the feed is available.'}</p>
      <button onClick={onHelp}><Plug size={13}/> Connection help</button>
    </div>
  </aside>;
}
