# Yjs × ProseMirror (y-prosemirror)

- 日時: 2026-09-01
- 環境: macOS, Chrome 149, IME: macOS 日本語入力（要確認）
- バージョン: yjs 13.6.32 / y-prosemirror 1.3.7 / prosemirror-view 1.42.3 / prosemirror-model 1.25.11
- 治具: `harness/yjs-prosemirror`（手動）。生ログ: `yjs-prosemirror.jsonl`
- 操作: A の1段落目末尾で変換中のまま待ち、リモート編集到着後に Space で変換 → Enter で確定

## 全シナリオ共通の観測

**未確定文字列は変換中の時点で共有文書に入っている。** `before-remote` の時点で B のテキストにも未確定文字列（例: "ぜんぽう"）が含まれる。根拠（コードで確認、prosemirror-view 1.42.3 / y-prosemirror 1.3.7）:
- prosemirror-view の `DOMObserver` は composition 中も DOM 変更を `flush()` し（例外は Safari のテーブル内のみ、`domobserver.ts`）、`readDOMChange` が変更を transaction にして `composition` メタを付けて dispatch する（`domchange.ts`）。つまり未確定文字列は state に入る。
- y-prosemirror の `ySyncPlugin` は `composition` メタも `view.composing` も参照せず（`sync-plugin.js` に該当文字列なし）、view の `update` で文書が変わるたびに `_prosemirrorChanged` → `updateYFragment` で Y.Doc に書く。
この前提が下の 2, 3, 4 の結果を決めている。

## 進捗（シナリオごとの状態）

段階の定義: **観測** = 治具でログを取った / **原因** = ライブラリのコードで機構を特定した / **残り** = 未着手の項目

| # | 観測 | 原因 | 残り |
| --- | --- | --- | --- |
| 1 | 済（問題なし） | 不要 | なし |
| 2 | 済（二重化） | 未 | 末尾挿入のどの DOM 更新で composition が失われるかを prosemirror-view の DOM 更新経路で特定する |
| 3 | 済（未確定文字列が消される） | 未 | 共有文書への未確定文字列の漏れが原因であることはコードで確認済（下記「全シナリオ共通」）。IME 内部状態が残って再入力される経路は未確認 |
| 4 | 済（カーソル飛び＋二重化） | 済 | 「IME なしでもカーソルが飛ぶ」の観測（コードからの導出のみ） |

組み合わせ全体の残り:
- IME の種類の確認（記録は「macOS 日本語入力（要確認）」のまま）
- 別ブラウザ（Safari / Firefox）での再観測。現状は Chrome 149 のみ

## シナリオ別

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ✅ | 変換継続。カーソル位置は 16→19 に正しく移動。確定後も二重化なし |
| 2 | 段落末尾に挿入（未確定文字列の直後） | ❌ 二重化 | `compositionend` は発火しないまま composition が失われる。次の Space で新しい `compositionstart` が始まり、変換結果 "広報" が別テキストとして挿入される。最終: `…こうほう【後】広報` |
| 3 | 段落テキスト全削除（未確定文字列を含む） | ⚠️ | 未確定文字列は共有文書から削除され、A も空になる。IME の内部状態は残っており、次の Space で新しい `compositionstart` から変換結果 "段落" が挿入される。文書は壊れないが、未確定文字列が他人に消される |
| 4 | 段落中央で分割 | ❌ カーソル飛び＋二重化 | 到着時に A の選択位置が 16→8（分割点）へ移動。次の Space で分割点に "分割" が挿入され、元の "ぶんかつ" は残る。最終: `あいうえお か分割きくけこぶんかつ` |

## 補足

- 2 と 4 で `compositionend` が発火していないのは事実だが、それは「問題なし」を意味しない。ブラウザが composition の対象ノードを見失い、次のキー入力が新しい composition として扱われる。
- 4 でカーソルが分割点に移る原因（確定、再実行ログとコード追跡による）:
  1. y-prosemirror はリモート変更のたびに文書全体を置き換え、選択位置は変更前に保存した Yjs 相対位置から復元する（`sync-plugin.js` `_typeChanged` → `restoreRelativeSelection`）。
  2. 変換中のカーソルは段落テキストの末尾にあるため、相対位置は「特定の文字の後」ではなく「その段落の XmlText の末尾」として符号化される（`lib.js` `absolutePositionToRelativePosition` → `createRelativePositionFromTypeIndex(text, length, 0)`）。
  3. B 側の `updateYFragment` は ProseMirror の split を「元段落の末尾テキストを削除し、新しい段落要素を後ろに挿入」として Y.Doc に書く（Yjs の XmlFragment には移動がないため）。再実行ログの `paras=A,B` と `remote-tr sel=8` がこれを示す。
  4. 結果、A の「元段落の末尾」は分割点 = 8 に解決する。ブラウザの DOM 選択もそれに従う（`domSel=8`）。
  - 復元直後の transaction で既に 8 なので、ProseMirror の view 層ではなく y-prosemirror の符号化と位置復元の組み合わせが原因。
  - Node だけの再現: `harness/yjs-prosemirror/split-cursor.test.mjs`（`node split-cursor.test.mjs`）。
  - コードから導かれる帰結（未観測）: この機構は IME に限らない。リモートの段落分割で後半に移された範囲にカーソルを置いている全クライアントで、カーソルが分割点へ移動するはず。IME の場合はさらに composition の対象 DOM ノードが作り直されるため、次の入力が新しい composition として分割点に入り二重化する。
