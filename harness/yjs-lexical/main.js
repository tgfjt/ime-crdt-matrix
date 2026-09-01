import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $getSelection, $createParagraphNode, $createTextNode, $isRangeSelection } from 'lexical'

const h = React.createElement
const logEl = document.getElementById('log')
const log = (...a) => { logEl.textContent += `${(performance.now() / 1000).toFixed(3)} ${a.join(' ')}\n`; logEl.scrollTop = 1e9 }

// ponytail: in-memory 直結の Provider。接続済みの Y.Doc 同士で update を転送する
const peers = []
const providerFactory = (id, yjsDocMap) => {
  const doc = new Y.Doc(); yjsDocMap.set(id, doc)
  const listeners = { sync: [], status: [], update: [], reload: [] }
  return {
    awareness: new Awareness(doc),
    connect() {
      for (const other of peers) Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), 'remote')
      peers.push(doc)
      doc.on('update', (u, origin) => { if (origin !== 'remote') for (const d of peers) if (d !== doc) Y.applyUpdate(d, u, 'remote') })
      listeners.status.forEach(cb => cb({ status: 'connected' }))
      listeners.sync.forEach(cb => cb(true))
    },
    disconnect() {},
    on(type, cb) { listeners[type].push(cb) },
    off(type, cb) { listeners[type] = listeners[type].filter(c => c !== cb) },
  }
}

const editors = {}
function Capture({ name }) {
  const [editor] = useLexicalComposerContext()
  editors[name] = editor
  return null
}
const initialA = () => { const p = $createParagraphNode(); p.append($createTextNode('あいうえお かきくけこ')); $getRoot().append(p) }
function Editor({ name, bootstrap }) {
  return h(LexicalCollaboration, null, h(LexicalComposer, { initialConfig: { namespace: name, editorState: null, onError: e => log(`${name} error ${e.message}`) } },
    h(RichTextPlugin, { contentEditable: h(ContentEditable, { id: name }), ErrorBoundary: LexicalErrorBoundary }),
    h(CollaborationPlugin, { id: 'room', providerFactory, shouldBootstrap: bootstrap, initialEditorState: bootstrap ? initialA : undefined }),
    h(Capture, { name })))
}
createRoot(document.getElementById('a')).render(h(Editor, { name: 'A', bootstrap: true }))
createRoot(document.getElementById('b')).render(h(Editor, { name: 'B', bootstrap: false }))

const sel = editor => editor.getEditorState().read(() => { const s = $getSelection(); return $isRangeSelection(s) ? `${s.anchor.key}:${s.anchor.offset}` : String(s) })
const text = editor => editor.getEditorState().read(() => $getRoot().getTextContent())
const domSelPos = () => { try { const s = document.getSelection(); return `${s.focusNode?.nodeType === 3 ? JSON.stringify(s.focusNode.data) : s.focusNode?.nodeName}@${s.focusOffset}` } catch { return '?' } }

let armed = false
const setup = () => {
  const A = editors.A, B = editors.B
  if (!A || !B || armed) return
  armed = true
  const dom = A.getRootElement()
  for (const ev of ['compositionstart', 'compositionupdate', 'compositionend']) {
    dom.addEventListener(ev, e => log(`A ${ev} data=${JSON.stringify(e.data)} composing=${A.isComposing()}`))
  }
  dom.addEventListener('beforeinput', e => log(`A beforeinput ${e.inputType} data=${JSON.stringify(e.data)}`))
  // @lexical/yjs がリモート変更を適用した update（tag 'collaboration'）の選択位置を記録する
  A.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
    if (tags.has('collaboration')) log(`A remote-tr sel=${sel(A)} domSel=${domSelPos()} dirty=${dirtyElements.size + dirtyLeaves.size}`)
  })
  const describe = n => n.nodeType === 3 ? `#text(${JSON.stringify(n.data)})` : `<${n.nodeName.toLowerCase()}>`
  new MutationObserver(ms => ms.forEach(m => {
    const s = m.type === 'characterData' ? `chardata ${JSON.stringify(m.oldValue)} -> ${JSON.stringify(m.target.data)}`
      : `${m.type} target=${describe(m.target)} +[${[...m.addedNodes].map(describe)}] -[${[...m.removedNodes].map(describe)}]`
    log(`A dom ${s}`)
  })).observe(dom, { childList: true, characterData: true, characterDataOldValue: true, subtree: true })
}
setTimeout(setup, 300)

const dump = tag => log(`${tag} A=${JSON.stringify(text(editors.A))} B=${JSON.stringify(text(editors.B))} selA=${sel(editors.A)}`)

// B 側の1段落目に対して Lexical の update で編集する（リモートユーザの操作を模す）
const firstText = () => $getRoot().getFirstChild().getFirstChild()
const scenarios = {
  before: () => editors.B.update(() => { const t = firstText(); t.spliceText(0, 0, '【前】') }),
  after: () => editors.B.update(() => { const t = firstText(); t.spliceText(t.getTextContentSize(), 0, '【後】') }),
  delete: () => editors.B.update(() => { $getRoot().getFirstChild().clear() }),
  split: () => editors.B.update(() => { const t = firstText(); const mid = Math.floor(t.getTextContentSize() / 2); t.select(mid, mid).insertParagraph() }),
}
let current = null
document.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => {
  const s = b.dataset.s, ms = +document.getElementById('delay').value
  current = s; logEl.textContent = ''
  log(`--- scenario ${s} in ${ms}ms. A で変換を開始して待つ`)
  editors.A.focus()
  setTimeout(() => { dump('before-remote'); scenarios[s](); setTimeout(() => dump('after-remote'), 0); setTimeout(() => dump('after-500ms'), 500) }, ms)
})
document.getElementById('reset').onclick = () => location.reload()
document.getElementById('record').onclick = async () => {
  const rec = {
    at: new Date().toISOString(), scenario: current, verdict: document.getElementById('verdict').value,
    ua: navigator.userAgent, platform: navigator.platform, versions: __VERSIONS__,
    finalA: text(editors.A), finalB: text(editors.B), log: logEl.textContent,
  }
  await fetch('/record', { method: 'POST', body: JSON.stringify(rec) })
  log(`recorded ${current}=${rec.verdict}`)
  setTimeout(() => location.reload(), 300)
}
// 自動操作・デバッグ用
Object.assign(window, { editors, peers })

Object.assign(window, { scenarios, dump })
