# 変換中の状態を自動テストで作れるか

- 日時: 2026-09-01
- 対象: Playwright 1.62.1（`harness/auto` にインストールしたもの）

## 結論

Playwright で「変換中」（`compositionstart` 〜 `compositionupdate` の状態）を作れるのは Chromium だけ。Firefox と WebKit（Safari）では作れない。ブラウザの起動や文字の入力はどれでもできる。作れないのは変換中の状態だけ。

## 確認した事実

1. Playwright の入力 API（`keyboard.type`、`keyboard.insertText` など）は文字を確定済みとして入れる。変換中を作る API はない。
2. Playwright 本体 `coreBundle.js` を検索した結果、"composition" を含む識別子が 0 件。エンジンごとの入力命令は Chromium=`Input.insertText` / `Input.dispatchKeyEvent`、Firefox=`Page.insertText` / `Page.dispatchKeyEvent`、WebKit=同様のみ。
3. Chromium の内部プロトコル CDP には `Input.imeSetComposition`（変換中を作る命令）がある。Playwright は `page.context().newCDPSession(page)` で CDP を直接呼ばせるので、これを使える。`harness/auto/run.mjs` はこの方法で動いている。
4. Firefox と WebKit に対して Playwright は独自プロトコルで操作しているが、それを利用者に直接呼ばせる API がない。したがって、仮にプロトコル側に相当する命令があっても Playwright からは呼べない。

## 未確認

- Firefox / WebKit のプロトコル自体に変換中を作る命令があるか。あっても 4 の理由で使えないため調べていない。
- 標準の WebDriver / WebDriver BiDi に相当する命令があるか。記憶では「ない」だが、仕様を読んで確認していない。

## この検証集にとっての意味

- Chrome 以外の結果（Safari / Firefox の記録）は、すべて人が IME を操作して取ったもの。
- 主要な自動テスト基盤で変換中を作れないことは、共同編集ライブラリの CI で IME の問題が再現されない理由の一部になる。
- Chromium の自動治具が人の操作と同じ結果になるかは、組み合わせごとに `results/*.md` の「自動治具との照合」節に書いた。Yjs × Lexical のシナリオ 3 では結果が違った。
