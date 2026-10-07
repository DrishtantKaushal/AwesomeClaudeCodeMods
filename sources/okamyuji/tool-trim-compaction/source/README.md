# tool-trim-compaction

Claude Codeのcompactionを、古いツール呼び出しの削除で済ませるプラグインです。会話の要約を作らないので、圧縮にかかる時間は数ミリ秒で、API費用もかかりません。ユーザーとアシスタントの発言は原文のまま残ります。

削除だけでは十分に小さくならない会話は、Claude Code標準のcompaction（LLMによる要約）にそのまま回します。

## 動き方

このプラグインは、ターンが終わるたびにcontext windowの使用率を確認します。使用率が60%以上なら、compactionを始める仕組みです。`/compact`を手で実行した場合も、同じ処理を通ります。

compactionでは、次の範囲のメッセージを残します。

- 会話の先頭の1件
- 直近の6件

この範囲より古いツール呼び出しは、その結果と一緒に削除します。呼び出しと結果は必ず組で扱います。結果だけを残すと、呼び出しの無い結果になり、APIがリクエストを拒否するためです。

削除によって会話の文字数が25%以上減った場合は、削除後の会話でそのまま続けます。25%に届かない場合は、標準compactionの要約に処理を渡します。

実際のセッションで試した例では、48,694 tokenの会話が9,953 tokenになり、所要時間は10msでした。

## 必要なもの

- Claude Code 2.1.288で動作を確認しています
- プラグインのhook（`session.compact`イベント）が使える版のClaude Codeが必要です

## 導入方法

### 1. リポジトリを取得する

置き場所はどこでも構いません。ここでは`~/.claude/local-plugins`の下に置く例を示します。

```bash
mkdir -p ~/.claude/local-plugins
git clone https://github.com/okamyuji/tool-trim-compaction.git ~/.claude/local-plugins/tool-trim-compaction
cd ~/.claude/local-plugins/tool-trim-compaction
git checkout "$(git describe --tags --abbrev=0)"
```

mainへのcommitごとに、`v0.1.1`のような版のタグが自動で付きます。上の手順で取り出すのは、その時点で最新のタグです。

このプラグインは、Claude Codeの中で会話の内容を書き換えます。タグで版を決めておけば、後から入った変更を確かめないまま読み込むことはありません。新しい版に上げるときは、`git fetch --tags`のあと変更内容を読んでから、`git checkout <タグ>`で切り替えてください。

### 2. Claude Codeに読み込ませる

`~/.claude/settings.json`の`env`に、`CLAUDE_CODE_PLUGIN_DIRS`を追加します。すでに`env`がある場合は、その中に1行を足してください。

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/local-plugins/tool-trim-compaction"
  }
}
```

ほかにもディレクトリから読み込むプラグインがある場合は、パスを`:`でつないで並べます。

### 3. Claude Codeを起動し直す

設定は、次に起動したセッションから有効になります。

1回だけ試したい場合は、設定を変えずに`--plugin-dir`で指定することもできます。

```bash
claude --plugin-dir ~/.claude/local-plugins/tool-trim-compaction
```

## 動作の確認

ツールを何度か使った会話で`/compact`を実行してください。削除で圧縮できた場合は、次のような行が表示されます。

```text
tool-trim: dropped 10 tool calls, 82% reduction, kept 8/28 messages
```

削減率が25%に届かなかった場合は、次の行が表示されたあと、標準compactionの要約が動きます。

```text
tool-trim: 16% reduction, below 25%; standard summary
```

プラグインの検証とテストは、次のコマンドで実行できます。

```bash
claude plugin validate ~/.claude/local-plugins/tool-trim-compaction
claude plugin test ~/.claude/local-plugins/tool-trim-compaction
```

## 値の変更

残す件数、削減率の閾値、compactionを始める使用率は、`hooks/register.ts`の先頭にある定数で決めています。

| 定数 | 既定値 | 意味 |
|---|---|---|
| `KEEP_RECENT_MESSAGES` | 6 | 削除の対象から外す直近のメッセージの件数 |
| `MIN_REDUCTION` | 0.25 | この削減率に届かなければ標準の要約に回す |
| `COMPACT_AT_PERCENT` | 60 | ターン終了時に、この使用率以上ならcompactionを始める |

## 注意点

削除したツール呼び出しの結果は、後から参照できなくなります。例えば、何十ターンも前に出たエラーメッセージの原文は文脈に残りません。エラーがあったこと自体が残らないので、モデルが「エラーは出ていない」と答える場合もあります。古いエラーの経緯を後でたどる作業では、標準compactionのほうが向いています。

`session.compact`イベントを使うほかのcompactionプラグインとは、同時に有効にしないでください。どちらの処理が先に動くかによって、結果が変わるためです。

## 削除方法

`~/.claude/settings.json`の`env`から`CLAUDE_CODE_PLUGIN_DIRS`の該当パスを消し、Claude Codeを起動し直します。そのあと、取得したディレクトリを削除してください。

## ライセンス

[MIT](LICENSE)
