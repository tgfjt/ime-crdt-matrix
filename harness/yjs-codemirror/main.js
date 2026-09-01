import * as Y from 'yjs'
import { yCollab, ySyncAnnotation } from 'y-codemirror.next'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const logEl = document.getElementById('log')
const log = (...a) => { logEl.textContent += `${(performance.now() / 1000).toFixed(3)} ${a.join(' ')}\n`; logEl.scrollTop = 1e9 }

// ponytail: in-memory 直結。ネットワーク遅延は setTimeout の遅延で代用
const docA = new Y.Doc(), docB = new Y.Doc()
docA.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(docB, u, 'remote') })
docB.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(docA, u, 'remote') })
docA.getText('cm').insert(0, 'あいうえお かきくけこ')

function makeView(mount, doc) {
  const ytext = doc.getText('cm')
  return new EditorView({
    parent: mount,
    state: EditorState.create({
      doc: ytext.toString(),
      extensions: [
        yCollab(ytext, null), // awareness なし
        EditorView.updateListener.of(u => {
          // y-codemirror が dispatch した transaction（リモート変更の適用）の選択位置を記録する
          if (u.transactions.some(tr => tr.annotation(ySyncAnnotation))) {
            log(`${mount.id.toUpperCase()} remote-tr sel=${u.state.selection.main.head} docChanged=${u.docChanged} domSel=${domSelPos(u.view)}`)
          }
        }),
      ],
    }),
  })
}
const domSelPos = view => { try { const s = document.getSelection(); return view.posAtDOM(s.focusNode, s.focusOffset) } catch { return '?' } }
const viewA = makeView(document.getElementById('a'), docA)
const viewB = makeView(document.getElementById('b'), docB)

for (const ev of ['compositionstart', 'compositionupdate', 'compositionend']) {
  viewA.contentDOM.addEventListener(ev, e => log(`A ${ev} data=${JSON.stringify(e.data)} composing=${viewA.composing}`))
}
viewA.contentDOM.addEventListener('beforeinput', e => log(`A beforeinput ${e.inputType} data=${JSON.stringify(e.data)}`))

// リモート到着時に A の DOM がどう変わるかを記録する
const describe = n => n.nodeType === 3 ? `#text(${JSON.stringify(n.data)})` : `<${n.nodeName.toLowerCase()}${n.className ? '.' + String(n.className).split(' ')[0] : ''}>`
new MutationObserver(ms => ms.forEach(m => {
  const s = m.type === 'characterData' ? `chardata ${JSON.stringify(m.oldValue)} -> ${JSON.stringify(m.target.data)}`
    : `${m.type} target=${describe(m.target)} +[${[...m.addedNodes].map(describe)}] -[${[...m.removedNodes].map(describe)}]`
  log(`A dom ${s}`)
})).observe(viewA.contentDOM, { childList: true, characterData: true, characterDataOldValue: true, subtree: true })

const dump = tag => log(`${tag} A=${JSON.stringify(viewA.state.doc.toString())} B=${JSON.stringify(viewB.state.doc.toString())} selA=${viewA.state.selection.main.head}`)

// B 側の1行目に対して CodeMirror transaction で編集する（リモートユーザの操作を模す）
const line1 = () => viewB.state.doc.line(1)
const scenarios = {
  before: () => viewB.dispatch({ changes: { from: 0, insert: '【前】' } }),
  after: () => viewB.dispatch({ changes: { from: line1().to, insert: '【後】' } }),
  delete: () => viewB.dispatch({ changes: { from: 0, to: line1().to } }),
  split: () => viewB.dispatch({ changes: { from: Math.floor(line1().length / 2), insert: '\n' } }),
}
let current = null
document.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => {
  const s = b.dataset.s, ms = +document.getElementById('delay').value
  current = s; logEl.textContent = ''
  log(`--- scenario ${s} in ${ms}ms. A で変換を開始して待つ`)
  viewA.focus()
  setTimeout(() => { dump('before-remote'); scenarios[s](); dump('after-remote'); setTimeout(() => dump('after-500ms'), 500) }, ms)
})
document.getElementById('reset').onclick = () => location.reload()
document.getElementById('record').onclick = async () => {
  const rec = {
    at: new Date().toISOString(), scenario: current, verdict: document.getElementById('verdict').value,
    ua: navigator.userAgent, platform: navigator.platform,
    versions: __VERSIONS__,
    finalA: viewA.state.doc.toString(), finalB: viewB.state.doc.toString(),
    log: logEl.textContent,
  }
  await fetch('/record', { method: 'POST', body: JSON.stringify(rec) })
  log(`recorded ${current}=${rec.verdict}`)
  setTimeout(() => location.reload(), 300)
}

// 自動操作・デバッグ用
Object.assign(window, { viewA, viewB, docA, docB })
