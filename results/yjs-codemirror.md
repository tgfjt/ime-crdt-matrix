# Yjs × CodeMirror (y-codemirror.next)

- 日時: 2026-09-01
- 環境: macOS, IME: Google 日本語入力。ブラウザ: Chrome 149
- バージョン: yjs 13.6.32 / y-codemirror.next 0.3.6 / @codemirror/view 6.43.10 / @codemirror/state 6.7.2
- 治具: `harness/yjs-codemirror`（手動）。生ログ: `yjs-codemirror.jsonl`
- 操作: A の 1 行目末尾で変換中のまま待ち、B の編集が A に入った後に Space で変換 → Enter で確定
- CodeMirror は 1 つの Y.Text に対応するので、「段落」は「行」に読み替える

## 進捗（シナリオごとの状態）

段階の定義: **観測** = 治具でログを取った / **原因** = ライブラリのコードで機構を特定した / **残り** = 未着手の項目

| # | 観測 | 原因 | 残り |
| --- | --- | --- | --- |
| 1 | 済（問題なし） | 不要 | なし |
| 2 | 済（問題なし） | 済（なぜ壊れないか、下記） | なし |
| 3 | 済（未確定文字列が消される） | 済（未確定文字列の漏れ、下記） | なし |
| 4 | 済（二重化） | 未 | 行分割でどの DOM 更新が composition を失わせるかは、DOM 変異ログ（テキストノード切り詰め＋新 `.cm-line` 追加）まで。CodeMirror の描画側のコードは未確認 |

組み合わせ全体の残り: Safari / Firefox での観測

## 全シナリオ共通の観測

**未確定文字列は変換中の時点で共有文書に入っている**（`before-remote` で B にも「うしろ」等が含まれる）。根拠: y-codemirror.next の `YSyncPluginValue.update` は `docChanged` な transaction をすべて Y.Text に書き、composition を区別しない（`y-sync.js` に `composing` への言及なし）。

## シナリオ別（Chrome 149）

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 行頭に挿入 | ✅ | 変換継続。カーソル 13→16。「前」が「まえ」を置き換え |
| 2 | 行末（未確定文字列の直後）に挿入 | ✅ | 変換継続。カーソルは 14 のまま（未確定文字列の直後に留まる）。「【後】」は別のテキストノードとして追加され、「後ろ」が「うしろ」を置き換え。最終: `あいうえお かきくけこ後ろ【後】` |
| 3 | 行テキスト全削除 | ⚠️ | 未確定文字列「どｎ」ごと削除され A は空になる。次の Space で新しい `compositionstart` から「どん」が入る（IME の内部状態が残っている、観測のみ）。文書は壊れないが、未確定文字列が他人に消される |
| 4 | 行中央で分割 | ❌ 二重化 | カーソルは 13→14 と正しく移動（分割点への移動は起きない）。しかし `compositionend` なしに composition が失われ、次の Space で新しい `compositionstart` から「文」が 14 に入り、「ぶｎ」は残る。最終: `あいうえお \nかきくけこぶｎ文` |

## 原因

- 2 が壊れない理由（ProseMirror 版では二重化した）: y-codemirror.next はリモートの delta を CodeMirror の `changes` として `view.dispatch` するだけで、選択位置を Yjs の相対位置から復元しない（`y-sync.js` `YSyncPluginValue` の `_observer`）。選択位置の対応付けは CodeMirror 自身が行い、カーソル（空選択）は既定で `assoc = -1`、つまりカーソル位置への挿入では挿入テキストの**前**に留まる（`@codemirror/state` `SelectionRange.map(change, assoc = -1)`）。したがってカーソルは未確定文字列の直後に留まり、composition は続く。ProseMirror 版の 2 との違いは、この「カーソルが未確定文字列から離れるかどうか」と一致する。
- 4 で分割点への移動が起きない理由: CodeMirror の行分割は Y.Text への「\n」挿入であり、ProseMirror 版のような「末尾テキスト削除＋新要素作成」にならない。カーソルは挿入 1 文字分ずれるだけ（`remote-tr sel=14`）。
- 4 で composition が失われる理由: DOM 変異ログでは、未確定文字列を含むテキストノードが `"あいうえお かきくけこぶｎ" -> "あいうえお "` に切り詰められ、新しい `.cm-line` が追加されている。未確定文字列の DOM 上の実体が別ノードに作り直されたことが composition の喪失と対応するが、CodeMirror の描画コードでの確認は未実施。
- 3: 共有文書に入った未確定文字列がリモートの削除範囲に含まれるため（上記「全シナリオ共通」）。
