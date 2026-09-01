# Yjs × ProseMirror (y-prosemirror)

- 日時: 2026-09-01
- 環境: macOS, IME: Google 日本語入力。ブラウザ: Chrome 149（主）、Safari 26.5、Firefox 142（下記「Safari での結果」「Firefox での結果」）
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
| 2 | 済（二重化） | 済（ブラウザ内部の1段だけ推定） | なし |
| 3 | 済（未確定文字列が消される） | 済（IME 内部の再入力は観測のみ） | なし |
| 4 | 済（カーソル飛び＋二重化） | 済 | なし（IME なしでのカーソル飛びも観測済、下記） |

組み合わせ全体の残り: なし（Chrome / Safari / Firefox で観測済）

## シナリオ別

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ✅ | 変換継続。カーソル位置は 16→19 に正しく移動。確定後も二重化なし |
| 2 | 段落末尾に挿入（未確定文字列の直後） | ❌ 二重化 | `compositionend` は発火しないまま composition が失われる。次の Space で新しい `compositionstart` が始まり、変換結果 "広報" が別テキストとして挿入される。最終: `…こうほう【後】広報` |
| 3 | 段落テキスト全削除（未確定文字列を含む） | ⚠️ | 未確定文字列は共有文書から削除され、A も空になる。IME の内部状態は残っており、次の Space で新しい `compositionstart` から変換結果 "段落" が挿入される。文書は壊れないが、未確定文字列が他人に消される |
| 4 | 段落中央で分割 | ❌ カーソル飛び＋二重化 | 到着時に A の選択位置が 16→8（分割点）へ移動。次の Space で分割点に "分割" が挿入され、元の "ぶんかつ" は残る。最終: `あいうえお か分割きくけこぶんかつ` |

## 補足

- 2 と 4 で `compositionend` が発火していないのは事実だが、それは「問題なし」を意味しない。ブラウザが composition の対象ノードを見失い、次のキー入力が新しい composition として扱われる。
- 2 で二重化する原因（再実行ログ 2026-09-01 06:18 とコード）:
  1. 変換中のカーソルは段落テキストの末尾（15）にあり、相対位置は「XmlText の末尾」として符号化される（4 と同じ、`lib.js` `absolutePositionToRelativePosition`）。
  2. B が同じ段落の末尾に「【後】」を挿入すると、「XmlText の末尾」は挿入後の位置に解決し、`remote-tr sel=18`、DOM 選択も 18 になる。つまりカーソルは未確定文字列「きょう」から離れ、「【後】」の後ろへ移る。DOM 変異は同じテキストノードへの追記1回（`chardata "…きょう" -> "…きょう【後】"`）。
  3. 次の Space で `compositionend` なしに新しい `compositionstart data="今日"` が 18 に入り、「きょう」は残る → `…きょう【後】今日`。
  - 1 との違い: 1 でも同じテキストノードが書き換えられる（先頭に「【前】」追記）が、カーソルは未確定文字列の直後に留まり（16→19）、変換は継続した。したがってテキストノードの書き換えだけでは composition は失われず、**カーソルが未確定文字列から離れること**が 1 と 2 を分ける。
  - ただしこれは ProseMirror 内での相関。Yjs × Lexical の Chrome 2 では同じくカーソルが「【後】」の後ろへ移ったのに composition は続いた（`results/yjs-lexical.md`）。ProseMirror 版で composition が失われる直接の機構（prosemirror-view 側の処理か、ブラウザ側か）は未特定。
  - 未確認: 「DOM 選択が composition の範囲外へ動くと Chrome が `compositionend` を出さずに composition を捨てる」というブラウザ内部の挙動は、ログ（イベントなし → 新 compositionstart）からの推定で、Chromium のコードでは確認していない。
- 3 で未確定文字列が消えた後に変換結果が入る経路（再実行ログ 2026-09-01 06:18）:
  - B の削除が適用されると A の段落からテキストノードが削除され `<br>` に置き換わる（`childList +[<br>]`, `-[#text("…きょう")]`）。未確定文字列は共有文書に入っていたので、リモートの削除範囲に含まれる。
  - 次の Space で新しい `compositionstart data="今日"` が位置 1 に入る。「きょう」を IME が保持していて変換結果を送ってきたことはログから分かるが、これは Google 日本語入力の内部状態であり、コードでは確認できない（観測のみ）。
- 4 でカーソルが分割点に移る原因（確定、再実行ログとコード追跡による）:
  1. y-prosemirror はリモート変更のたびに文書全体を置き換え、選択位置は変更前に保存した Yjs 相対位置から復元する（`sync-plugin.js` `_typeChanged` → `restoreRelativeSelection`）。
  2. 変換中のカーソルは段落テキストの末尾にあるため、相対位置は「特定の文字の後」ではなく「その段落の XmlText の末尾」として符号化される（`lib.js` `absolutePositionToRelativePosition` → `createRelativePositionFromTypeIndex(text, length, 0)`）。
  3. B 側の `updateYFragment` は ProseMirror の split を「元段落の末尾テキストを削除し、新しい段落要素を後ろに挿入」として Y.Doc に書く（Yjs の XmlFragment には移動がないため）。再実行ログの `paras=A,B` と `remote-tr sel=8` がこれを示す。
  4. 結果、A の「元段落の末尾」は分割点 = 8 に解決する。ブラウザの DOM 選択もそれに従う（`domSel=8`）。
  - 復元直後の transaction で既に 8 なので、ProseMirror の view 層ではなく y-prosemirror の符号化と位置復元の組み合わせが原因。
  - Node だけの再現: `harness/yjs-prosemirror/split-cursor.test.mjs`（`node split-cursor.test.mjs`）。
  - IME なしでも起きる（観測済、2026-09-01、Chrome 149、DOM 選択を段落末尾 12 に置いてからリモート分割を適用）:
    ```
    before-remote A="あいうえお かきくけこ" selA=12 paras=A
    A remote-tr sel=6 docChanged=true
    after-remote selA=6 paras=A,B
    A dom chardata "あいうえお かきくけこ" -> "あいうえお"
    A dom childList target=<div> +[<p>] -[]
    ```
    カーソルは分割点 6 へ移動した。つまりこの機構は IME に依存せず、リモートの段落分割で後半に移された範囲にカーソルがある全クライアントで起きる。IME の場合はさらに、上の DOM 変異（テキストノードの切り詰め＋新 `<p>` 追加）で composition の対象テキストノードが書き換えられるため、次の入力が新しい composition として分割点に入り二重化する。

## Safari での結果（Safari 26.5、2026-09-01 06:47、生ログは同 jsonl の UA=Safari の4件）

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ✅ | 変換継続。カーソル 14→17。変換結果「前」が「まえ」を置き換え（`deleteCompositionText` → `insertFromComposition`）、二重化なし |
| 2 | 段落末尾に挿入 | ❌ 強制確定 | B の編集が適用された直後に `compositionend data=""` が発火し、未確定の「うしろ」がそのまま確定する。以後の Space は通常の全角スペース入力（`insertText "　"`）になり、変換できない。最終: `…うしろ【後】　` |
| 3 | 段落テキスト全削除 | ❌ 入力消失 | `compositionend data=""` が発火し、未確定文字列は削除済みなので何も残らない。Chrome と違い IME も「だん」を保持しておらず、次の Space は全角スペースになる。最終: `　` |
| 4 | 段落中央で分割 | ❌ 強制確定＋カーソル飛び | `compositionend data=""` が発火し「だん」が後半段落に確定。カーソルは分割点 7 へ移動（`remote-tr sel=7`、機構は Chrome と同じ）。次の入力は分割点に入る。最終: `あいうえおあかきくけこだん` |

Chrome との違い:
- Chrome では 2, 3, 4 で composition がイベントなしに失われ、IME が未確定文字列を保持したまま次の Space で新しい composition として変換結果を挿入する（二重化）。
- Safari では 2, 3, 4 で B の編集の適用と同時に `compositionend data=""` が発火し、未確定文字列がその時点の文字（ひらがな）で確定する（強制確定）。IME の内部状態も破棄され、次の入力は通常入力になる。
- 1 は両ブラウザで問題なし。1 と 2〜4 を分けるのは Chrome と同じで、カーソルと未確定文字列の位置関係が保たれるかどうか（1 ではカーソルが未確定文字列の直後に留まる）。
- カーソル位置の復元（`remote-tr sel=`）は両ブラウザで同じ値になる。これは y-prosemirror の処理でブラウザに依存しないため。
- 未確認: Safari が `compositionend` を発火する条件（DOM 選択の移動か、テキストノードの変更か）は、WebKit のコードでは確認していない。

## Firefox での結果（Firefox 142、2026-09-01 06:51、生ログは同 jsonl の UA=Firefox の4件）

| # | リモート編集 | 結果 | 症状 |
| --- | --- | --- | --- |
| 1 | 段落先頭に挿入 | ✅ | 変換継続。カーソル 14→17。「前」が「まえ」を置き換え、二重化なし |
| 2 | 段落末尾に挿入 | ❌ 二重化（位置ずれ） | `compositionend` も新しい `compositionstart` も発火せず、同じ composition が続く。しかし変換結果「後ろ」は**段落の先頭**（位置 1）に入り、「うしろ」は残る。最終: `後ろあいうえお かきくけこうしろ【後】` |
| 3 | 段落テキスト全削除 | ❌ 入力消失 | composition は続き、変換候補の切り替え（段→団→断→…→談）ごとに `compositionupdate` が来るが、DOM には空のテキストノードと `<br>` の付け外しだけが起き、文字が入らない。`compositionend data="談"` 後も A は空。最終: `` |
| 4 | 段落中央で分割 | ❌ 二重化（位置ずれ）＋カーソル飛び | カーソルは分割点 7 へ（`remote-tr sel=7`、y-prosemirror の処理）。composition は続くが、変換結果「談」は前半段落の**先頭**（位置 1）に入り、「だん」は後半段落に残る。最終: `談あいうえお かきくけこだん` |

3 ブラウザの比較（2〜4 で composition がどうなるか）:
- Chrome: composition をイベントなしに捨てる。次の入力は新しい composition としてカーソル位置に入る → 二重化（カーソル位置に）
- Safari: B の編集の適用と同時に `compositionend data=""` → 未確定文字列がひらがなのまま確定、IME 状態も破棄 → 強制確定 / 入力消失
- Firefox: composition は続くが、変換結果が入る DOM 上の位置が段落先頭にずれる（2, 4）、または削除済みノードに向いて文書に入らない（3） → 二重化（段落先頭に）/ 入力消失
- 1 は 3 ブラウザとも問題なし。カーソルの復元位置（`remote-tr sel=`）は 3 ブラウザで同じ。
- 未確認: Firefox で変換結果が段落先頭に入る機構（Gecko が composition の範囲をどう保持しているか）は、コードでは確認していない。ログ上は、B の編集後の最初の `compositionupdate` で先頭のテキストノードに前置される（`chardata "あいうえお " -> "談あいうえお "`）ことまで。
