import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EmptyOfficeNotice, { FeedStatus } from '../src/OfficeConnectionStatus';

describe('office feed is separate from agent reporting', () => {
  it('keeps a live, empty office in a waiting state instead of claiming its agents are connected', () => {
    const header = renderToStaticMarkup(<FeedStatus connection="Live view" hasReports={false}/>);
    expect(header).toContain('Live view'); expect(header).toContain('Waiting for agents');
    const notice = renderToStaticMarkup(<EmptyOfficeNotice connection="Live view" onHelp={() => {}}/>);
    expect(notice).toContain('No agent activity has arrived');
    expect(notice).toContain('Dismiss waiting notice');
    expect(notice).not.toContain('Set up the connection'); expect(notice).not.toContain('dialog');
  });
  it('stops waiting after real reports, and does not call a disconnected feed live', () => {
    expect(renderToStaticMarkup(<FeedStatus connection="Live view" hasReports/>)).not.toContain('Waiting for agents');
    expect(renderToStaticMarkup(<FeedStatus connection="Reconnecting…" hasReports={false}/>)).not.toContain('feed-online');
  });
});
