# Yjs × Lexical (@lexical/yjs)

- 日時: 2026-09-01
- 環境: macOS, IME: Google 日本語入力。ブラウザ: Chrome 149
- バージョン: yjs 13.6.32 / lexical 0.49.0 / @lexical/yjs 0.49.0 / @lexical/react 0.49.0 / react 19.2.8
- 治具: `harness/yjs-lexical`（手動）。生ログ: `yjs-lexical.jsonl`。Provider は in-memory 直結の自作
- 操作: A の 1 段落目末尾で変換中のまま待ち、B の編集が A に入った後に Space で変換 → Enter で確定
- 選択位置の表記 `12:13` は Lexical の `anchor.key:anchor.offset`（key 12 = 1 段落目のテキストノード）

## 進捗（シナリオごとの状態）

段階の定義: **観測** = 治具でログを取った / **原因** = ライブラリのコードで機構を特定した / **残り** = 未着手の項目

| # | 観測 | 原因 | 残り |
| --- | --- | --- | --- |
| 1 | 済（問題なし） | 不要 | なし |
| 2 | 済（問題なし） | 未 | カーソルが「【後】」の後ろへ移っても composition が続いた理由（ProseMirror 版 2 との違い）を Lexical のコードで確認する |
| 3 | 済（入力消失） | 未 | 段落が空になった後の composition を Lexical が DOM から取り消す経路を確認する |
| 4 | 済（強制確定＋入力位置ずれ） | 未 | B の編集の適用**前**に `compositionend` が出る経路（@lexical/yjs か Lexical 本体か）を確認する。IME なしでもカーソルが分割点へ移ることは観測済（下記） |

組み合わせ全体の残り: Safari / Firefox での観測

## 全シナリオ共通の観測

- 未確定文字列は変換中の時点で共有文書に入っている（`before-remote` で B にも「うしろ」等が含まれる）。@lexical/yjs のコードでの確認は未実施。
- Lexical は composition 開始時にテキストノード末尾へゼロ幅スペース（U+200B）を付ける（DOM 変異ログ `"…こ" -> "…こ​​"`）。確定時に外れる。

## シナリオ別（Chrome 149）

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ✅ | 変換継続。選択 12:13→12:16。「前」が「まえ」を置き換え |
| 2 | 段落末尾（未確定文字列の直後）に挿入 | ✅ | 変換継続。選択は 12:14→12:17（「【後】」の後ろ）へ移り、DOM 選択も同じ位置だが、変換結果「後ろ」は「うしろ」を正しく置き換えた。確定後の選択は 12:11（「後ろ」の直後）。最終: `あいうえお かきくけこ後ろ【後】` |
| 3 | 段落テキスト全削除 | ❌ 入力消失 | 未確定文字列「だん」ごと `<span>` が削除され `<br>` になる。次の Space で新しい `compositionstart data="談"` が来て DOM に「談」が入るが、直後に Lexical が取り消す（`+[#text("談")]` → `-[#text("談")]`、`<span>` の付け外し）。Enter で空段落が増えるだけ。最終: `\n\n` |
| 4 | 段落中央で分割 | ❌ 強制確定＋入力位置ずれ | B の編集の適用より**前**に `compositionend data="ぶん"` が発火し「ぶん」が確定。適用後の選択は `null`。その後の Space は全角スペースとして 2 段落目の先頭に入り、さらにそれが独立した段落になる。最終: `あいうえお \n\n　\n\nかきくけこぶん` |

## 観測から言えること・未確認のこと

- 2 は ProseMirror 版と同じくカーソルが「【後】」の後ろへ移ったが、composition は失われなかった。したがって ProseMirror 版の記録にある「カーソルが未確定文字列から離れることが 1 と 2 を分ける」は ProseMirror 内での相関であり、ブラウザ共通の機構ではない（`results/yjs-prosemirror.md` に注記）。
- 4 の `compositionend` は B の編集が適用される前（`before-remote` の 2ms 後、`remote-tr` の前）に出ている。@lexical/yjs か Lexical 本体が remote 変更の適用前に composition を終了させていると推定するが、コードでは未確認。
- IME なしでの 4（私の Chrome で、DOM 選択を段落末尾に置いてから分割を適用）: 選択 12:11 → 12:5（前半段落の末尾 = 分割点）へ移動した。ProseMirror 版と同じ種類のカーソル移動。機構は @lexical/yjs のコードで未確認。

## 自動治具との照合（Chromium headless 151、Playwright + CDP `Input.imeSetComposition`、2026-09-01）

| # | 人力（Chrome 149） | 自動 | 一致 |
| --- | --- | --- | --- |
| 1 | 変換継続 | 変換継続 | 一致 |
| 2 | 変換継続、選択 12:14→12:17 でも置き換え成功 | 同じ | 一致 |
| 3 | 入力消失（「談」が DOM に入って直後に取り消される、Enter で空段落） | 新 `compositionstart` → 最終 `段落​`（ゼロ幅スペース付きで残る。`compositionend` の記録なし） | **不一致** |
| 4 | B の編集の適用前に `compositionend`、Space が 2 段落目の先頭に入る | 適用前に `compositionend`、「文」が 2 段落目の先頭に入る → `あいうえお 文かきくけこぶん` | 一致 |

3 の不一致について（未解明）: `harness/auto/probe-lexical-delete.mjs` で自動側の手順を 3 通り試した（`insertText` のみ / 候補切り替え 談→団→段落 の後 `insertText` / 候補切り替えの後 Enter）。3 通りとも最終テキストは `段落` で残った。共通の経過: 最初の `compositionstart` の「談」は Lexical に取り消される（人力と同じ）が、その後 Chrome が `compositionstart data="談"` で composition を作り直し、以降の更新は通る。人力のログにはこの作り直しがなく、DOM の付け外しの後に `insertParagraph` だけが来ている。差は「Lexical が composition のテキストノードを取り消した後、本物の IME（Google 日本語入力）が composition を続行できるか」にあると推定するが、IME 側の挙動なので確認できない。Lexical の 3 は人力の記録を正とし、自動治具はこのシナリオを再現できていないものとして扱う。