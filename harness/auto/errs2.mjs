import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const h = process.argv[2], URL = 'http://localhost:5199/'
const vite = spawn('pnpm', ['exec', 'vite', '--port', '5199', '--strictPort'], { cwd: `../${h}`, stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }
const browser = await chromium.launch(); const page = await browser.newPage()
page.on('pageerror', e => console.log('pageerror:', (e.stack || String(e)).slice(0, 900)))
await page.goto(URL); await sleep(2500)
await browser.close(); vite.kill()
