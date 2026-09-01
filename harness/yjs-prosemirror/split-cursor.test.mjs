// シナリオ4 の再現: 変換中カーソル(段落末尾)が、リモートの段落分割で分割点へ移動する
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { updateYFragment, absolutePositionToRelativePosition, relativePositionToAbsolutePosition, prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'

const docA = new Y.Doc(), docB = new Y.Doc()
docA.on('update', (u, o) => o !== 'r' && Y.applyUpdate(docB, u, 'r'))
docB.on('update', (u, o) => o !== 'r' && Y.applyUpdate(docA, u, 'r'))
const fragA = docA.getXmlFragment('pm'), fragB = docB.getXmlFragment('pm')
prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'あいうえお かきくけこぶんかつ' }] }] }, fragA)

const meta = () => ({ mapping: new Map(), isOMark: new Map() })
const metaA = meta(), metaB = meta()
const pmDoc = (frag, m) => yXmlFragmentToProseMirrorRootNode(frag, schema) // mapping は空で良い
// A: 変換中カーソルは段落末尾 = 1 + 15 = 16
const before = pmDoc(fragA, metaA)
assert.equal(before.textContent, 'あいうえお かきくけこぶんかつ')
const rel = absolutePositionToRelativePosition(16, fragA, metaA.mapping)
// mapping を作るため一度 updateYFragment を通す（binding が持つ mapping の代わり）
updateYFragment(docA, fragA, before, metaA)

// B: 位置 8 で段落分割（「か」と「き」の間）
const stateB = EditorState.create({ schema, doc: pmDoc(fragB, metaB) })
updateYFragment(docB, fragB, stateB.doc, metaB)
const split = stateB.apply(stateB.tr.split(8))
updateYFragment(docB, fragB, split.doc, metaB)

const after = pmDoc(fragA, metaA)
assert.equal(after.childCount, 2)
assert.equal(after.textContent, 'あいうえお かきくけこぶんかつ')
updateYFragment(docA, fragA, after, metaA) // mapping 更新
const abs = relativePositionToAbsolutePosition(docA, fragA, rel, metaA.mapping)
// 元段落の Y.Item が残った側を確認（分割をどう符号化したか）
const [p1, p2] = fragA.toArray().map(e => e.toArray()[0]._item.id.clock)
console.log('restored selection =', abs, '| p1 text clock =', p1, '| p2 text clock =', p2)
// モデル層では分割点(8)には移動しない。19 は段落末尾(18)の相対位置が要素末尾に付く既知の癖で、別問題。
assert.notEqual(abs, 8, 'モデル層の相対位置復元は分割点へ移動しない')
console.log('ok: ブラウザで観測した 8 は y-prosemirror の位置復元ではなく view 層で起きている')
