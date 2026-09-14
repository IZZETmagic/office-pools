// Rasterise a directory of SVGs into one contact-sheet PNG via headless Chrome.
// Needed because nothing else on this machine renders SVG, and an SVG that
// looks right in a text editor tells you nothing (§7e.9 — look at the output).
//   node scripts/shot-svgs.mjs <dir> <out.png> [cols]
import { readdirSync, writeFileSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'

const dir = resolve(process.argv[2])
const out = resolve(process.argv[3])
const cols = Number(process.argv[4] ?? 4)
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()
const cell = 280

const html = `<html><body style="margin:0;background:#0F1115;font:11px -apple-system,sans-serif">
<div style="display:grid;grid-template-columns:repeat(${cols},${cell}px)">
${files.map((f) => `<div style="padding:8px"><img src="file://${join(dir, f)}" width="${cell - 16}" height="${cell - 16}" style="display:block;background:#fff;border-radius:8px"><div style="color:#9aa;padding-top:4px">${f.replace('.svg', '')}</div></div>`).join('\n')}
</div></body></html>`

const tmp = mkdtempSync(join(tmpdir(), 'shot-'))
const page = join(tmp, 'sheet.html')
writeFileSync(page, html)
const rows = Math.ceil(files.length / cols)
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--hide-scrollbars',
  `--screenshot=${out}`, `--window-size=${cols * cell},${rows * (cell + 14)}`,
  `file://${page}`,
], { stdio: 'ignore' })
console.log(`${out}  ${files.length} svgs`)
