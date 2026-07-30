/**
 * Renders every email template with representative sample data into a single browsable
 * page, so the whole set can be reviewed in light AND dark without sending anything.
 *
 *   npx tsx scripts/preview-emails.ts
 *   open .preview-emails/index.html
 *
 * The dark toggle rewrites `@media (prefers-color-scheme:dark)` to `@media all` inside
 * each iframe. That exercises the real rules the email ships rather than a preview-only
 * class, so what you see is what Apple Mail / iOS Mail / Outlook mac will render.
 *
 * Caveat worth remembering while reviewing: Gmail and Outlook for Windows ignore
 * prefers-color-scheme entirely and run their own force-invert over the inline light
 * styles. Nothing here predicts that — only a real test send would.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildSamples } from './email-samples'

const OUT_DIR = join(process.cwd(), '.preview-emails')

const rendered = buildSamples()

// --- Write the index ----------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })

for (const r of rendered) {
  writeFileSync(join(OUT_DIR, `${r.id}.html`), r.html, 'utf8')
}

const groups = [...new Set(rendered.map((r) => r.group))]

const nav = groups
  .map(
    (g) => `<div class="navgroup"><h3>${g}</h3>${rendered
      .filter((r) => r.group === g)
      .map((r) => `<a href="#${r.id}">${r.label}</a>`)
      .join('')}</div>`
  )
  .join('')

const cards = groups
  .map(
    (g) => `<section><h2 class="grouphead">${g}</h2>${rendered
      .filter((r) => r.group === g)
      .map(
        (r) => `<article id="${r.id}" class="card">
          <header><h3>${r.label}</h3><p class="subject"><span>Subject</span> ${escapeHtml(r.subject)}</p></header>
          <iframe data-frame data-key="${r.id}" title="${r.label}"></iframe>
        </article>`
      )
      .join('')}</section>`
  )
  .join('')

// Frames are populated via srcdoc from this map rather than src="<file>.html".
// A file:// iframe loaded by src is cross-origin in Chrome, so contentDocument would be
// null and the dark toggle would silently do nothing; srcdoc inherits the parent origin,
// so the preview works from disk with no server. The per-template files are still
// written alongside for opening one email on its own.
const payload = JSON.stringify(Object.fromEntries(rendered.map((r) => [r.id, r.html])))

const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportPool email preview — ${rendered.length} templates</title>
<style>
  :root{--bg:#F7F8FC;--fg:#1B2340;--muted:#7B87A8;--line:#EEF1F8;--card:#FFFFFF;}
  body.dark{--bg:#121520;--fg:#E8EAF0;--muted:#8B97B8;--line:#232840;--card:#1C2030;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;}
  nav{position:sticky;top:0;align-self:flex-start;height:100vh;overflow-y:auto;width:250px;flex:none;padding:20px 16px;border-right:1px solid var(--line);background:var(--card);}
  nav h2{font-size:15px;margin:0 0 4px;}
  nav .count{font-size:12px;color:var(--muted);margin:0 0 16px;}
  .navgroup h3{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);margin:16px 0 6px;}
  nav a{display:block;font-size:12px;color:var(--fg);text-decoration:none;padding:4px 6px;border-radius:6px;opacity:.85;}
  nav a:hover{background:var(--line);opacity:1;}
  main{flex:1;padding:20px 28px 80px;min-width:0;}
  .bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0 14px;border-bottom:1px solid var(--line);margin-bottom:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
  button{font:inherit;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;}
  button.on{background:#3B6EFF;border-color:#3B6EFF;color:#fff;}
  .hint{font-size:12px;color:var(--muted);}
  .grouphead{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted);margin:32px 0 12px;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin:0 0 20px;}
  .card header{padding:14px 18px;border-bottom:1px solid var(--line);}
  .card h3{margin:0;font-size:14px;}
  .subject{margin:6px 0 0;font-size:12px;color:var(--muted);}
  .subject span{display:inline-block;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;border:1px solid var(--line);border-radius:4px;padding:1px 5px;margin-right:6px;}
  iframe{display:block;width:100%;height:760px;border:0;background:#fff;}
  body.dark iframe{background:#121520;}
</style>
</head>
<body>
<nav>
  <h2>Email preview</h2>
  <p class="count">${rendered.length} templates</p>
  ${nav}
</nav>
<main>
  <div class="bar">
    <button id="toggle">Force dark mode</button>
    <span class="hint">Rewrites <code>@media (prefers-color-scheme:dark)</code> &rarr; <code>@media all</code> in each frame. Gmail &amp; Outlook/Windows ignore that query and force-invert instead &mdash; unverifiable here.</span>
  </div>
  ${cards}
</main>
<script>
  var EMAILS = ${payload};
  var dark = false;

  function apply(frame){
    var doc = frame.contentDocument;
    if(!doc) return;
    doc.querySelectorAll('style').forEach(function(s){
      if(dark){
        if(s.textContent.indexOf('@media (prefers-color-scheme:dark)') > -1){
          s.dataset.orig = s.textContent;
          s.textContent = s.textContent.replace('@media (prefers-color-scheme:dark)', '@media all');
        }
      } else if(s.dataset.orig){
        s.textContent = s.dataset.orig;
        delete s.dataset.orig;
      }
    });
  }

  var frames = [].slice.call(document.querySelectorAll('[data-frame]'));
  frames.forEach(function(f){
    f.addEventListener('load', function(){ apply(f); });
    f.srcdoc = EMAILS[f.dataset.key];
  });

  document.getElementById('toggle').addEventListener('click', function(){
    dark = !dark;
    this.classList.toggle('on', dark);
    this.textContent = dark ? 'Back to light mode' : 'Force dark mode';
    document.body.classList.toggle('dark', dark);
    frames.forEach(apply);
  });
</script>
</body></html>`

writeFileSync(join(OUT_DIR, 'index.html'), index, 'utf8')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

console.log(`Rendered ${rendered.length} templates -> ${join(OUT_DIR, 'index.html')}`)
console.log(`  open ${join(OUT_DIR, 'index.html')}`)
