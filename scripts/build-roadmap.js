'use strict';

// Builds the public roadmap page (_site/roadmap.html + index.html) from
// GitHub issues labelled `roadmap`.
//
// Column rules:
//   closed issue                 -> Launched
//   label "status: working-on"   -> Working on
//   label "status: upcoming"     -> Upcoming
//   otherwise                    -> Backlog
// Labels (other than `roadmap` and `status:`) render as tag pills; the first
// line of the issue body is the card description.

const fs = require('fs');
const path = require('path');

const REPO = process.env.GITHUB_REPOSITORY || 'afrugalpenguin/dbml-diff';
const OUT_DIR = path.join(__dirname, '..', '_site');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function firstLine(body) {
  if (!body) return '';
  const line = body.split(/\r?\n/).find((l) => l.trim()) || '';
  const plain = line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
  return plain.length > 170 ? `${plain.slice(0, 169).trimEnd()}...` : plain;
}

// Stable small hash so a label keeps its pill colour between builds.
function hueClass(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `h${h % 6}`;
}

function column(issue) {
  if (issue.state === 'closed') return 'launched';
  const labels = issue.labels.map((l) => l.name);
  if (labels.includes('status: working-on')) return 'working';
  if (labels.includes('status: upcoming')) return 'upcoming';
  return 'backlog';
}

function card(issue) {
  const tags = issue.labels
    .map((l) => l.name)
    .filter((n) => n !== 'roadmap' && !n.startsWith('status:'))
    .map((n) => `<span class="tag ${hueClass(n)}">${esc(n)}</span>`)
    .join('');
  const desc = firstLine(issue.body);
  return `      <article class="card">
        <h3><a href="${esc(issue.html_url)}">${esc(issue.title)}</a></h3>
        ${desc ? `<p>${esc(desc)}</p>` : ''}
        <div class="src"><a href="${esc(issue.html_url)}">#${issue.number}</a></div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
      </article>`;
}

async function fetchIssues() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dbml-diff-roadmap' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/issues?labels=roadmap&state=all&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return issues;
}

function render(issues) {
  const cols = { backlog: [], upcoming: [], working: [], launched: [] };
  for (const i of issues) cols[column(i)].push(i);
  cols.backlog.sort((a, b) => a.number - b.number);
  cols.upcoming.sort((a, b) => a.number - b.number);
  cols.working.sort((a, b) => a.number - b.number);
  cols.launched.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));

  const section = (key, name) => `    <section class="col col-${key}" aria-label="${name}">
      <div class="col-head"><span class="pill"><span class="dot"></span>${name}</span><span class="count">${cols[key].length}</span></div>
${cols[key].map(card).join('\n')}
    </section>`;

  const stamp = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dbml-diff - Public Roadmap</title>
<style>
  :root {
    --bg: #f5f6f8; --col-bg: #eceef2; --card-bg: #ffffff; --card-border: #dfe3ea;
    --text: #1b222c; --text-soft: #4c5665; --text-faint: #7b8595; --link: #2563b0;
    --backlog: #64748b; --upcoming: #cf4b57; --working: #3b82c4; --launched: #2f9e5f;
    --shadow: 0 1px 2px rgba(15, 19, 25, 0.06);
    --mono: ui-monospace, "Cascadia Code", Consolas, "SF Mono", Menlo, monospace;
    --sans: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --p0: #2f7fbe; --p1: #2f9e5f; --p2: #c28414; --p3: #7a63b8; --p4: #b85c68; --p5: #5c8a8a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1319; --col-bg: #141922; --card-bg: #1a212c; --card-border: #232c39;
      --text: #e6eaf0; --text-soft: #a8b2c0; --text-faint: #6c7787; --link: #6aa5dd;
      --backlog: #8a97a8; --upcoming: #e0707c; --working: #5b9bd4; --launched: #46b878;
      --shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      --p0: #6fa8d6; --p1: #56b57f; --p2: #d3a13e; --p3: #a48fd6; --p4: #cf8490; --p5: #7fabab;
    }
  }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); margin: 0; padding: 2.5rem 2rem 3rem; }
  .wrap { max-width: 1400px; margin: 0 auto; }
  header { margin-bottom: 2rem; }
  h1 { font-family: var(--mono); font-size: 1.75rem; font-weight: 700; margin: 0 0 0.35rem; letter-spacing: -0.01em; text-wrap: balance; }
  h1 .dim { color: var(--text-faint); font-weight: 400; }
  .sub { color: var(--text-soft); font-size: 0.95rem; max-width: 62ch; margin: 0 0 0.9rem; line-height: 1.5; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1.4rem; align-items: baseline; font-size: 0.8rem; color: var(--text-faint); font-family: var(--mono); }
  .meta a { color: var(--link); text-decoration: none; }
  .meta a:hover, .meta a:focus-visible { text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--upcoming); outline-offset: 2px; border-radius: 2px; }
  .board { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; }
  .col { flex: 0 0 300px; background: var(--col-bg); border-radius: 10px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.7rem; align-self: flex-start; }
  .col-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.15rem 0.15rem; }
  .pill { display: inline-flex; align-items: center; gap: 0.42rem; font-family: var(--mono); font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.22rem 0.62rem; border-radius: 999px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .col-backlog .pill { background: color-mix(in srgb, var(--backlog) 18%, transparent); color: var(--backlog); }
  .col-upcoming .pill { background: color-mix(in srgb, var(--upcoming) 18%, transparent); color: var(--upcoming); }
  .col-working .pill { background: color-mix(in srgb, var(--working) 18%, transparent); color: var(--working); }
  .col-launched .pill { background: color-mix(in srgb, var(--launched) 18%, transparent); color: var(--launched); }
  .col-backlog .dot { background: var(--backlog); }
  .col-upcoming .dot { background: var(--upcoming); }
  .col-working .dot { background: var(--working); }
  .col-launched .dot { background: var(--launched); }
  .count { margin-left: auto; font-family: var(--mono); font-size: 0.72rem; font-weight: 400; color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 0.85rem 0.9rem; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 0.5rem; }
  .col-backlog .card { border-color: color-mix(in srgb, var(--backlog) 35%, var(--card-border)); background: color-mix(in srgb, var(--backlog) 7%, var(--card-bg)); }
  .col-upcoming .card { border-color: color-mix(in srgb, var(--upcoming) 35%, var(--card-border)); background: color-mix(in srgb, var(--upcoming) 7%, var(--card-bg)); }
  .col-working .card { border-color: color-mix(in srgb, var(--working) 35%, var(--card-border)); background: color-mix(in srgb, var(--working) 7%, var(--card-bg)); }
  .col-launched .card { border-color: color-mix(in srgb, var(--launched) 35%, var(--card-border)); background: color-mix(in srgb, var(--launched) 7%, var(--card-bg)); }
  @media (prefers-reduced-motion: no-preference) {
    .card { transition: transform 120ms ease, box-shadow 120ms ease; }
    .card:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18); }
  }
  .card h3 { font-size: 0.9rem; font-weight: 600; margin: 0; line-height: 1.35; }
  .card h3 a { color: var(--text); text-decoration: none; }
  .card h3 a:hover, .card h3 a:focus-visible { color: var(--link); }
  .card p { margin: 0; font-size: 0.8rem; line-height: 1.5; color: var(--text-soft); }
  .src { font-family: var(--mono); font-size: 0.72rem; }
  .src a { color: var(--text-faint); text-decoration: none; }
  .src a:hover, .src a:focus-visible { color: var(--link); text-decoration: underline; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .tag { font-family: var(--mono); font-size: 0.66rem; font-weight: 600; padding: 0.14rem 0.5rem; border-radius: 4px; letter-spacing: 0.02em; }
  .h0 { background: color-mix(in srgb, var(--p0) 16%, transparent); color: var(--p0); }
  .h1 { background: color-mix(in srgb, var(--p1) 16%, transparent); color: var(--p1); }
  .h2 { background: color-mix(in srgb, var(--p2) 16%, transparent); color: var(--p2); }
  .h3 { background: color-mix(in srgb, var(--p3) 16%, transparent); color: var(--p3); }
  .h4 { background: color-mix(in srgb, var(--p4) 16%, transparent); color: var(--p4); }
  .h5 { background: color-mix(in srgb, var(--p5) 16%, transparent); color: var(--p5); }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>dbml-diff <span class="dim">/ public roadmap</span></h1>
    <p class="sub">What just shipped, what's being worked on, and what's next for the DBML schema-diff CLI and library. Cards link to the GitHub issues where each item is tracked - comment there to influence priority.</p>
    <div class="meta">
      <span>last updated: ${stamp}</span>
      <a href="https://www.npmjs.com/package/dbml-diff">npm</a>
      <a href="https://github.com/${REPO}">github</a>
      <a href="https://github.com/${REPO}/issues">request a feature</a>
    </div>
  </header>
  <div class="board">
${section('backlog', 'Backlog')}
${section('upcoming', 'Upcoming')}
${section('working', 'Working on')}
${section('launched', 'Launched')}
  </div>
</div>
</body>
</html>
`;
}

async function main() {
  const issues = await fetchIssues();
  const html = render(issues);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'roadmap.html'), html);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  console.log(`Rendered ${issues.length} roadmap cards to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
