import * as Y from 'yjs'
import { ySyncPluginKey, ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'

const logEl = document.getElementById('log')
const log = (...a) => { logEl.textContent += `${(performance.now() / 1000).toFixed(3)} ${a.join(' ')}\n`; logEl.scrollTop = 1e9 }

// ponytail: in-memory 直結。ネットワーク遅延は setTimeout の遅延で代用
const docA = new Y.Doc(), docB = new Y.Doc()
docA.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(docB, u, 'remote') })
docB.on('update', (u, origin) => { if (origin !== 'remote') Y.applyUpdate(docA, u, 'remote') })

const initial = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'あいうえお かきくけこ' }] }] }
prosemirrorJSONToYXmlFragment(schema, initial, docA.getXmlFragment('pm'))

function makeView(mount, doc) {
  const frag = doc.getXmlFragment('pm')
  return new EditorView(mount, {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(frag), yUndoPlugin(), keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }), keymap(baseKeymap)],
    }),
    // y-prosemirror が dispatch した transaction の選択位置と、その後 state に入った選択位置を分けて記録する
    dispatchTransaction(tr) {
      const y = tr.getMeta(ySyncPluginKey)
      if (y?.isChangeOrigin) log(`${mount.id.toUpperCase()} remote-tr sel=${tr.selection.from} docChanged=${tr.docChanged}`)
      this.updateState(this.state.apply(tr))
      if (y?.isChangeOrigin) log(`${mount.id.toUpperCase()} after-updateState state.sel=${this.state.selection.from} domSel=${domSelPos(this)}`)
    },
  })
}
const domSelPos = view => { try { const s = document.getSelection(); return view.posAtDOM(s.focusNode, s.focusOffset) } catch { return '?' } }
const viewA = makeView(document.getElementById('a'), docA)
const viewB = makeView(document.getElementById('b'), docB)

for (const ev of ['compositionstart', 'compositionupdate', 'compositionend']) {
  viewA.dom.addEventListener(ev, e => log(`A ${ev} data=${JSON.stringify(e.data)} composing=${viewA.composing}`))
}
viewA.dom.addEventListener('selectionchange', () => {})
viewA.dom.addEventListener('beforeinput', e => log(`A beforeinput ${e.inputType} data=${JSON.stringify(e.data)}`))

// 各段落の Y.XmlElement を作ったクライアント（A=初期段落, B=リモートが新規作成）
const paras = () => docA.getXmlFragment('pm').toArray().map(e => e._item.id.client === docA.clientID ? 'A' : 'B').join(',')
// リモート到着時に A の DOM がどう変わるかを記録する（シナリオ 2 の原因調査用）
const describe = n => n.nodeType === 3 ? `#text(${JSON.stringify(n.data)})` : `<${n.nodeName.toLowerCase()}>`
new MutationObserver(ms => ms.forEach(m => {
  const s = m.type === 'characterData' ? `chardata ${JSON.stringify(m.oldValue)} -> ${JSON.stringify(m.target.data)}`
    : `${m.type} target=${describe(m.target)} +[${[...m.addedNodes].map(describe)}] -[${[...m.removedNodes].map(describe)}]`
  log(`A dom ${s}`)
})).observe(viewA.dom, { childList: true, characterData: true, characterDataOldValue: true, subtree: true })
const dump = tag => log(`${tag} A=${JSON.stringify(viewA.state.doc.textContent)} B=${JSON.stringify(viewB.state.doc.textContent)} selA=${viewA.state.selection.from} paras=${paras()}`)

// B 側の1段落目に対して ProseMirror transaction で編集する（リモートユーザの操作を模す）
const scenarios = {
  before: () => viewB.dispatch(viewB.state.tr.insertText('【前】', 1)),
  after: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.insertText('【後】', 1 + p.content.size)) },
  delete: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.delete(1, 1 + p.content.size)) },
  split: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.split(1 + Math.floor(p.content.size / 2))) },
}
document.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => {
  const s = b.dataset.s, ms = +document.getElementById('delay').value
  log(`--- scenario ${s} in ${ms}ms. A で変換を開始して待つ`)
  viewA.focus()
  setTimeout(() => { dump('before-remote'); scenarios[s](); dump('after-remote'); setTimeout(() => dump('after-500ms'), 500) }, ms)
})
document.getElementById('reset').onclick = () => location.reload()

let current = null
document.querySelectorAll('button[data-s]').forEach(b => b.addEventListener('click', () => { current = b.dataset.s; logEl.textContent = '' }))
document.getElementById('record').onclick = async () => {
  const rec = {
    at: new Date().toISOString(), scenario: current, verdict: document.getElementById('verdict').value,
    ua: navigator.userAgent, platform: navigator.platform,
    versions: __VERSIONS__,
    finalA: viewA.state.doc.textContent, finalB: viewB.state.doc.textContent,
    log: logEl.textContent,
  }
  await fetch('/record', { method: 'POST', body: JSON.stringify(rec) })
  log(`recorded ${current}=${rec.verdict}`)
  setTimeout(() => location.reload(), 300)
}
