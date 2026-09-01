// Lexical シナリオ3 の人力との不一致調査: 候補切り替え（compose を複数回）と Enter 確定を真似る
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const PORT = 5199, URL = `http://localhost:${PORT}/`
const vite = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], { cwd: '../yjs-lexical', stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }
const browser = await chromium.launch(); const page = await browser.newPage(); const cdp = await page.context().newCDPSession(page)
const compose = text => cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
for (const variant of ['insertText', 'cycle+insertText', 'cycle+Enter']) {
  await page.goto(URL); await sleep(1000)
  await page.evaluate(() => { document.getElementById('log').textContent = '' })
  await page.focus('#a [contenteditable="true"]'); await page.keyboard.press('End')
  for (const t of ['だ', 'だん']) { await compose(t); await sleep(80) }
  await sleep(300)
  await page.evaluate(() => { dump('before-remote'); scenarios.delete(); setTimeout(() => dump('after-remote'), 0) })
  await sleep(500)
  const cands = variant.startsWith('cycle') ? ['談', '団', '段落'] : ['段落']
  for (const c of cands) { await compose(c); await sleep(400) }
  if (variant.endsWith('Enter')) await page.keyboard.press('Enter'); else await cdp.send('Input.insertText', { text: '段落' })
  await sleep(400)
  const r = await page.evaluate(() => ({ A: document.getElementById('A').textContent, log: document.getElementById('log').textContent }))
  console.log(`== ${variant}: A=${JSON.stringify(r.A)}\n  ` + r.log.split('\n').filter(l => /composition|A dom|beforeinput/.test(l) && /after-500|composition|dom|beforeinput/.test(l)).slice(-14).join('\n  '))
}
await browser.close(); vite.kill()
