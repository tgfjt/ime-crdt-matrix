# Loro × ProseMirror (loro-prosemirror)

- 日時: 2026-09-01
- 環境: 自動治具（`harness/auto/run.mjs loro-prosemirror`、Chromium headless 151、CDP `Input.imeSetComposition`）のみ。人の IME 操作による記録はまだない
- バージョン: loro-crdt 1.15.1 / loro-prosemirror 0.4.4 / prosemirror-view 1.42.3 / prosemirror-model 1.25.11
- 治具: `harness/loro-prosemirror`。生ログ: `loro-prosemirror.jsonl`
- 操作: A の 1 段落目末尾で変換中のまま、B の編集を適用し、その後に変換結果を確定

## 進捗（シナリオごとの状態）

段階の定義: **観測** = 治具でログを取った / **原因** = ライブラリのコードで機構を特定した / **残り** = 未着手の項目

| # | 観測 | 原因 | 残り |
| --- | --- | --- | --- |
| 1 | 済（変換は継続、ただし選択位置が誤る） | 済 | 人の IME での確認 |
| 2 | 済（二重化） | 未（composition が失われる直接の機構は Yjs × ProseMirror と同じく未特定） | 人の IME での確認 |
| 3 | 済（未確定文字列が消される） | 済 | 人の IME での確認 |
| 4 | 済（カーソル飛び＋二重化） | 済 | 人の IME での確認 |

組み合わせ全体の残り: 人の IME での確認（Chrome）、Safari / Firefox

## 全シナリオ共通の観測

未確定文字列は変換中の時点で共有文書に入っている（`before-remote` で B にも「まえ」等が含まれる）。loro-prosemirror は `docChanged` な transaction をすべて Loro に書き、composition を区別しない（`dist/index.js` の `apply` で `doc-changed` メタを受けて `updateLoroToPmState` を呼ぶ。`composing` への言及なし）。

## シナリオ別（Chromium、自動治具）

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ⚠️ | 変換は継続し「前」が「まえ」を置き換えた。しかし ProseMirror の選択位置は 14 のまま（正しくは 17）。B の編集の直後は 17（`remote-tr sel=17`）だったが、その後の選択位置の復元で 14 に戻された。IME には影響しないが、次にキー入力すると 3 文字手前に入る |
| 2 | 段落末尾（未確定文字列の直後）に挿入 | ❌ 二重化 | 選択位置は 18 → 復元で 15（「うしろ」の直後、「【後】」の前）。`compositionend` なしに composition が失われ、新しい `compositionstart` で「後ろ」が 15 に入る。最終: `…こうしろ後ろ【後】` |
| 3 | 段落テキスト全削除 | ⚠️ | 未確定文字列ごと削除され A は空。次の composition で「段落」が入る。最終: `段落` |
| 4 | 段落中央で分割 | ❌ カーソル飛び＋二重化 | 選択位置は 16（後半段落の末尾、正しい）→ 復元で 7（分割点）。新しい `compositionstart` で「文」が 7 に入り、「ぶん」は後半段落に残る。最終: `あいうえお文かきくけこぶん` |

## 原因（loro-prosemirror 0.4.4 のコード）

- リモート変更の適用は Loro の `subscribe` コールバック `updateNodeOnLoroEvent` で行う。文書全体を `tr.replace(0, size, …)` で置き換え（この時点の選択位置は ProseMirror の対応付けで正しい: 1 で 17、4 で 16）、その後 `setTimeout` で `syncCursorsToPmSelection` により選択位置を Loro のカーソルから復元する。
- そのカーソルは `convertPmSelectionToCursors(view.state.doc, view.state.selection, state)` で作るが、これは **import 済みの Loro 文書** に対して **置き換え前の ProseMirror の文字オフセット** で `LoroText.getCursor(index)` を呼ぶ（`absolutePositionToCursor`）。つまり「変更後のテキストの、変更前と同じ番号の位置」にカーソルが作られる。
  - 1: 変更前のオフセット 13 → 「【前】」挿入後のテキストの 13 番目 → 選択位置 14。正しい 17 にならない。
  - 4: 変更前のオフセット 13 → 分割後の前半段落（6 文字）の 13 番目 → 末尾に丸められ、分割点 7。
  - 2: 変更前のオフセット 14 → 「【後】」挿入後のテキストの 14 番目 → 「うしろ」の直後 15。結果として望ましい位置だが、同じ機構による偶然。
- この機構は IME に依存しない。リモート変更が自分のカーソルより前で起きると、誰のカーソルでも変更前の番号の位置に戻される。IME の場合は 4 で composition の DOM ノードが作り直され、次の入力が新しい composition として分割点に入る。
- 2 で composition が失われる直接の機構（prosemirror-view 側かブラウザ側か）は、Yjs × ProseMirror と同じく未特定。

## Yjs × ProseMirror との違い

- 4 のカーソル飛びは結果が同じ（分割点へ）だが機構が違う。Yjs 版は相対位置が「XmlText の末尾」に付くため。Loro 版は変更後の文書に変更前のオフセットでカーソルを作るため。
- 1 で Loro 版は選択位置が誤る（Yjs 版は正しい）。
- 2 の二重化の位置が違う。Yjs 版は「【後】」の後ろ、Loro 版は「【後】」の前。
