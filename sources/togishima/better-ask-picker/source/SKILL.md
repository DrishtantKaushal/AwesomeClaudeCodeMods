---
name: better-ask-picker
description: 質問の概要を表示しつつ、選択肢を全件1画面に出して1つまたは複数選ばせたいときに使う。mcp__better-ask-picker__pick ツールを登録するプラグイン（spike）。選択肢が5個以上、または複数選択（multiSelect）が必要な場合に使う。
---

# better-ask-picker

`mcp__better-ask-picker__pick` を呼ぶと、専用ペインに質問の概要と全選択肢を表示する。

- `question`: 質問文（必須）
- `summary`: 質問の概要・背景（Markdown、任意）
- `options`: `[{ label, description? }]`（2個以上、上限なし）
- `multiSelect`: true で複数選択（決定ボタンで確定）
- `questions`: 複数の設問を順に聞く場合に、上の4項目の代わりに `[{ question, summary?, options, multiSelect? }]` を渡す（`question` / `options` とは同時指定不可）。1つのペインで `(1/3)` と進捗を出し、`b` で前の設問に戻れる

戻り値は JSON 文字列 `{"selected":["A","C"]}`。`questions` のときは `{"answers":[{"question":"…","selected":["…"]}]}`。キャンセル時は `{"selected":[],"cancelled":true}`（`questions` のときは `{"answers":[],"cancelled":true}`）。同じ応答内で並列に2回呼ぶと2回目は拒否されるので、複数の設問は `questions` でまとめて渡す。

ターミナル幅が144列未満などでペインを出せない場合は、ネイティブの質問ダイアログ（4択ずつ）に自動でフォールバックする。
