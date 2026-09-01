// シナリオ4 の原因確認（ブラウザ観測: paras=A,B / remote-tr sel=8）
// ブラウザでは B の updateYFragment が「元段落を残して末尾テキストを削除し、新段落を後ろに作る」形で分割を符号化した。
// その符号化を Yjs 操作で直接再現し、A の相対位置がどこへ復元されるかを見る。
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from 'prosemirror-schema-basic'

const docA = new Y.Doc(), docB = new Y.Doc()
docA.on('update', (u, o) => o !== 'r' && Y.applyUpdate(docB, u, 'r'))
docB.on('update', (u, o) => o !== 'r' && Y.applyUpdate(docA, u, 'r'))
const fragA = docA.getXmlFragment('pm'), fragB = docB.getXmlFragment('pm')
prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'あいうえお かきくけこぶんま' }] }] }, fragA)

const mapping = new Map()
const pm = yXmlFragmentToProseMirrorRootNode(fragA, schema)
mapping.set(fragA.get(0), pm.firstChild)
// A の変換中カーソル = 段落末尾 = 1 + 14 = 15
const rel = absolutePositionToRelativePosition(15, fragA, mapping)
assert.equal(rel.item, null, '末尾の相対位置は「文字」ではなく「XmlText の末尾」に付く')

// B の分割（ブラウザで観測した符号化）: 元段落の text[7..] を削除し、新段落を後ろに挿入
docB.transact(() => {
  const p = fragB.get(0), t = p.get(0)
  const tail = t.toString().slice(7)
  t.delete(7, t.length - 7)
  const np = new Y.XmlElement('paragraph'); const nt = new Y.XmlText(); nt.insert(0, tail); np.insert(0, [nt])
  fragB.insert(1, [np])
})
const after = yXmlFragmentToProseMirrorRootNode(fragA, schema)
assert.equal(after.textContent, 'あいうえお かきくけこぶんま')
mapping.set(fragA.get(0), after.child(0)); mapping.set(fragA.get(1), after.child(1))
const abs = relativePositionToAbsolutePosition(docA, fragA, rel, mapping)
console.log('restored selection =', abs)
assert.equal(abs, 8, '相対位置は元段落の末尾 = 分割点(8) に復元される（ブラウザ観測と一致）')
console.log('ok')
