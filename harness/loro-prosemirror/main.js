import { LoroDoc } from 'loro-crdt'
import { LoroSyncPlugin, loroSyncPluginKey } from 'loro-prosemirror'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'

const logEl = document.getElementById('log')
const log = (...a) => { logEl.textContent += `${(performance.now() / 1000).toFixed(3)} ${a.join(' ')}\n`; logEl.scrollTop = 1e9 }

// ponytail: in-memory 直結。ローカル更新をそのまま相手に import する
const docA = new LoroDoc(), docB = new LoroDoc()
docA.subscribeLocalUpdates(u => docB.import(u))
docB.subscribeLocalUpdates(u => docA.import(u))


let lastRemoteAt = -1
function makeView(mount, doc) {
  return new EditorView(mount, {
    state: EditorState.create({ schema, plugins: [LoroSyncPlugin({ doc }), keymap(baseKeymap)] }),
    // loro-prosemirror がリモート変更を適用した transaction と、その直後の選択位置の復元を分けて記録する
    dispatchTransaction(tr) {
      const meta = tr.getMeta(loroSyncPluginKey)
      const id = mount.id.toUpperCase()
      if (meta?.type === 'non-local-updates') { lastRemoteAt = performance.now(); log(`${id} remote-tr sel=${tr.selection.from} docChanged=${tr.docChanged}`) }
      else if (id === 'A' && tr.selectionSet && !tr.docChanged && performance.now() - lastRemoteAt < 200) log(`A cursor-restore sel=${tr.selection.from}`)
      this.updateState(this.state.apply(tr))
      if (meta?.type === 'non-local-updates') log(`${id} after-updateState state.sel=${this.state.selection.from} domSel=${domSelPos(this)}`)
    },
  })
}
const domSelPos = view => { try { const s = document.getSelection(); return view.posAtDOM(s.focusNode, s.focusOffset) } catch { return '?' } }
const viewA = makeView(document.getElementById('a'), docA)
const viewB = makeView(document.getElementById('b'), docB)
// loro-prosemirror は Loro が空だと初期化時に ProseMirror 側の文書を消すので、初期文書は view 作成後に入れる
viewA.dispatch(viewA.state.tr.insertText('あいうえお かきくけこ', 1))

for (const ev of ['compositionstart', 'compositionupdate', 'compositionend']) {
  viewA.dom.addEventListener(ev, e => log(`A ${ev} data=${JSON.stringify(e.data)} composing=${viewA.composing}`))
}
viewA.dom.addEventListener('beforeinput', e => log(`A beforeinput ${e.inputType} data=${JSON.stringify(e.data)}`))
const describe = n => n.nodeType === 3 ? `#text(${JSON.stringify(n.data)})` : `<${n.nodeName.toLowerCase()}>`
new MutationObserver(ms => ms.forEach(m => {
  const s = m.type === 'characterData' ? `chardata ${JSON.stringify(m.oldValue)} -> ${JSON.stringify(m.target.data)}`
    : `${m.type} target=${describe(m.target)} +[${[...m.addedNodes].map(describe)}] -[${[...m.removedNodes].map(describe)}]`
  log(`A dom ${s}`)
})).observe(viewA.dom, { childList: true, characterData: true, characterDataOldValue: true, subtree: true })

const dump = tag => log(`${tag} A=${JSON.stringify(viewA.state.doc.textContent)} B=${JSON.stringify(viewB.state.doc.textContent)} selA=${viewA.state.selection.from}`)

// B 側の1段落目に対して ProseMirror transaction で編集する（リモートユーザの操作を模す）
const scenarios = {
  before: () => viewB.dispatch(viewB.state.tr.insertText('【前】', 1)),
  after: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.insertText('【後】', 1 + p.content.size)) },
  delete: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.delete(1, 1 + p.content.size)) },
  split: () => { const p = viewB.state.doc.firstChild; viewB.dispatch(viewB.state.tr.split(1 + Math.floor(p.content.size / 2))) },
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
    ua: navigator.userAgent, platform: navigator.platform, versions: __VERSIONS__,
    finalA: viewA.state.doc.textContent, finalB: viewB.state.doc.textContent, log: logEl.textContent,
  }
  await fetch('/record', { method: 'POST', body: JSON.stringify(rec) })
  log(`recorded ${current}=${rec.verdict}`)
  setTimeout(() => location.reload(), 300)
}
// 自動操作・デバッグ用
Object.assign(window, { viewA, viewB, docA, docB, scenarios, dump })
