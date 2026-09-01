import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
const h = process.argv[2], URL = 'http://localhost:5199/'
const vite = spawn('pnpm', ['exec', 'vite', '--port', '5199', '--strictPort'], { cwd: `../${h}`, stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }
const browser = await chromium.launch(); const page = await browser.newPage()
page.on('console', m => m.type() === 'error' && console.log('console:', m.text().slice(0, 500)))
page.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 500)))
await page.goto(URL); await sleep(3000)
console.log('a=', await page.evaluate(() => document.getElementById('a').innerHTML.slice(0, 200)))
await browser.close(); vite.kill()
