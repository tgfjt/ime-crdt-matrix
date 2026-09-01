// Playwright + CDP Input.imeSetComposition で「変換中」を作り、各 harness の4シナリオを回して results/*.jsonl に記録する
// 使い方: node run.mjs <harness名> [scenario...]   例: node run.mjs yjs-prosemirror
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const [harness, ...only] = process.argv.slice(2)
if (!harness) { console.error('usage: node run.mjs <harness> [scenario...]'); process.exit(1) }
const PORT = 5199, URL = `http://localhost:${PORT}/`

// 各シナリオで打つ未確定文字列の段階と、変換結果（人力の記録に合わせる）
const INPUT = {
  before: { steps: ['ｍ', 'ま', 'まえ'], commit: '前' },
  after: { steps: ['う', 'うし', 'うしろ'], commit: '後ろ' },
  delete: { steps: ['だ', 'だん'], commit: '段落' },
  split: { steps: ['ぶ', 'ぶん'], commit: '文' },
}
const DELAY = 1500

const vite = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], { cwd: `../${harness}`, stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }

const browser = await chromium.launch()
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)
const compose = text => cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })

const results = []
for (const s of only.length ? only : Object.keys(INPUT)) {
  await page.goto(URL); await sleep(1000)
  await page.evaluate(() => { document.getElementById('log').textContent = '' })
  await page.focus('#a [contenteditable="true"]')
  await page.keyboard.press('End') // 1段落目（1行目）の末尾へ
  for (const t of INPUT[s].steps) { await compose(t); await sleep(80) }
  await sleep(300)
  // ボタンの時限式ではなく、変換中であることを確認してから B の編集を直接走らせる
  await page.evaluate(sc => { dump('before-remote'); scenarios[sc](); setTimeout(() => dump('after-remote'), 0) }, s)
  await sleep(500)
  await page.evaluate(() => dump('after-500ms'))
  await compose(INPUT[s].commit) // 変換候補の表示に相当
  await sleep(150)
  await cdp.send('Input.insertText', { text: INPUT[s].commit }) // 確定
  await sleep(300)
  const rec = await page.evaluate(() => {
    const t = el => el?.textContent ?? ''
    const a = window.viewA?.state?.doc?.textContent ?? window.viewA?.state?.doc?.toString?.() ?? window.editors?.A?.getEditorState().read(() => document.getElementById('A').textContent)
    const b = window.viewB?.state?.doc?.textContent ?? window.viewB?.state?.doc?.toString?.() ?? (window.editors ? t(document.getElementById('B')) : '')
    return { finalA: a, finalB: b, log: document.getElementById('log').textContent, ua: navigator.userAgent, platform: navigator.platform, versions: window.__VERSIONS__ }
  })
  const out = { at: new Date().toISOString(), scenario: s, verdict: 'auto', auto: 'playwright+cdp imeSetComposition', ...rec }
  await fetch(URL + 'record', { method: 'POST', body: JSON.stringify(out) })
  results.push(out)
  console.log(`== ${s}\n  A=${JSON.stringify(out.finalA)}\n  ` + out.log.split('\n').filter(l => /remote|composition|before-remote|after-/.test(l) && !/^ *\d+\.\d+ B /.test(l)).join('\n  '))
}
await browser.close(); vite.kill()
