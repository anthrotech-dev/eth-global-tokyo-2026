/**
 * Demo fixtures: this Worker's own origin plays the role of a "web2 host" that
 * has adopted TipRouter. It serves a fake profile page with a `tipjar:` bio and
 * the `/.well-known/tip-router` document.
 */
import { WELL_KNOWN_PATH } from '../shared/tipRouter.ts'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function profilePage(handle: string, bio: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@${escapeHtml(handle)} - demo profile</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 640px; margin: 48px auto; padding: 0 16px; color: #222; }
  .card { border: 1px solid #ddd; border-radius: 12px; padding: 24px; }
  .handle { color: #777; }
  .bio { margin-top: 12px; white-space: pre-line; }
  .note { margin-top: 24px; font-size: 13px; color: #888; }
  code { background: #f4f3ec; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<div class="card">
  <h1>${escapeHtml(handle)} <span class="handle">@${escapeHtml(handle)}</span></h1>
  <div class="bio">${escapeHtml(bio)}</div>
</div>
<p class="note">This is a fixture served by the general-tipper Worker to stand in for a Mastodon-style profile.
The host's tipjar is advertised at <code>${WELL_KNOWN_PATH}</code> on this origin.</p>
</body>
</html>`
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** Returns a Response for fixture paths, or null when the path is not a fixture. */
export function handleDemo(request: Request, env: Env): Response | null {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === WELL_KNOWN_PATH) {
    const body = { version: 1, feeBps: Number(env.DEMO_FEE_BPS), tipjars: { ethereum: env.DEMO_HOST } }
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (path === '/demo/@alice') {
    return profilePage(
      'alice',
      `Hi, I'm Alice. I post about coffee and Ethereum.\n\nethereum:${env.DEMO_RECEIVER}\nsui:0x${'ab'.repeat(32)}`,
    )
  }
  if (path === '/demo/@nobody') {
    return profilePage('nobody', 'I have not set up a tipjar yet.')
  }
  if (path === '/demo' || path === '/demo/') {
    const base = url.origin
    return new Response(
      `Demo fixtures:\n  ${base}/demo/@alice   (has tipjar)\n  ${base}/demo/@nobody  (no tipjar)\n  ${base}${WELL_KNOWN_PATH}\n`,
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }
  return null
}
