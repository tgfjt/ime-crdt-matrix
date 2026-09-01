import * as Y from 'yjs'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
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
  })
}
const viewA = makeView(document.getElementById('a'), docA)
const viewB = makeView(document.getElementById('b'), docB)

for (const ev of ['compositionstart', 'compositionupdate', 'compositionend']) {
  viewA.dom.addEventListener(ev, e => log(`A ${ev} data=${JSON.stringify(e.data)} composing=${viewA.composing}`))
}
viewA.dom.addEventListener('beforeinput', e => log(`A beforeinput ${e.inputType} data=${JSON.stringify(e.data)}`))

const dump = tag => log(`${tag} A=${JSON.stringify(viewA.state.doc.textContent)} B=${JSON.stringify(viewB.state.doc.textContent)} selA=${viewA.state.selection.from}`)

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
