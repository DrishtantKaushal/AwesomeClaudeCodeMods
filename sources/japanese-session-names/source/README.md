# rename-ja

Claude Code の `/rename` を引数なしで実行したときに、会話の内容から日本語のセッション名を付ける mod です。

組み込みの `/rename` は、英小文字の kebab-case（例: `fix-login-bug`）で名前を生成します。この mod は、その名前を日本語に置き換えます。

| 入力 | mod なし | mod あり |
| --- | --- | --- |
| `/rename` | `typescript-remove-duplicates` | `配列の重複除去方法` |
| `/rename 好きな名前` | `好きな名前` | `好きな名前` |

名前を指定した `/rename` の動作は変わりません。

## 前提条件

この mod は、Claude Code の function hooks を使います。function hooks は early access の機能で、既定では無効です。

`~/.claude/settings.json` の `env` に次の 1 行を追加して、Claude Code を再起動してください。

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

1 回だけ試す場合は、環境変数を付けて起動します。

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

動作を確認した Claude Code のバージョンは 2.1.286 です。これより古いバージョンは、mod が使う API の形が異なるため、動かない可能性があります。

## インストール

```sh
claude plugin marketplace add tomatoaiu/rename-ja
claude plugin install rename-ja@tomatoaiu-mods
```

インストール後に Claude Code を再起動すると、mod が読み込まれます。
配布元の `stable` ブランチは、GitHub Release として公開したコミットだけを指します。
開発中の `main` は、通常のインストールには使いません。

## 使い方

1. Claude Code で 1 往復以上会話します。
2. `/rename` を引数なしで実行します。

画面には `/rename <生成された名前>` と表示されます。mod が生成した名前を引数に入れてから、組み込みの `/rename` に渡しているためです。

## 設定

名前を生成するときに Haiku へ渡す指示文（プロンプト）を変更できます。設定しない場合、mod は 20 文字以内の日本語名を生成する既定のプロンプトを使います。

| 項目 | 型 | 内容 |
| --- | --- | --- |
| `prompt` | 1 行の文字列 | Haiku へ渡す指示文。会話の抜粋は、ユーザーメッセージとして別に渡されます。 |

設定方法は 3 通りあります。どの方法でも、設定後に Claude Code を再起動すると反映されます。

Claude Code の中で設定する場合は、次のコマンドを実行します。

```
/plugin configure rename-ja@tomatoaiu-mods
```

シェルから設定する場合は、JSON を標準入力で渡します。

```sh
echo '{"prompt":"ユーザーメッセージは会話の抜粋です。その主題を表すセッション名を1つだけ出力してください。必ず絵文字1つで始め、続けて10文字以内の日本語を書く。説明文なし。"}' \
  | claude plugin configure rename-ja@tomatoaiu-mods --values-stdin
```

`~/.claude/settings.json` に直接書く場合は、`pluginConfigs` に追加します。

```json
{
  "pluginConfigs": {
    "rename-ja@tomatoaiu-mods": {
      "options": {
        "prompt": "Output exactly one English session name in Title Case, at most 4 words, no punctuation, no explanation. The user message is a conversation excerpt."
      }
    }
  }
}
```

プロンプトの内容にかかわらず、mod は Haiku の返答の 1 行目だけを採用し、前後の引用符を取り除き、40 文字で切ります。

## 仕組み

mod は `command.run` イベントを `rename` コマンドに限定して hook します。

- 引数が空のときだけ、会話の本文を Haiku に渡して、セッション名を 1 つ生成します。
- 会話が長い場合、mod は冒頭 2000 字と末尾 4000 字だけを Haiku に渡します。
- 生成に失敗した場合、mod は何も書き換えず、組み込みの `/rename` が英語名を付けます。

## 注意点

- function hooks の API は、Claude Code の更新で予告なく変わる可能性があります。API が変わると、この mod は失敗し、`/rename` は組み込みの英語名に戻ります。
- 環境変数を設定していても、Claude Code が mod を読み込まないことがあります。function hooks の読み込みは、Anthropic 側の段階的公開のフラグにも左右されるためです。このとき、`/rename` は組み込みの英語名に戻ります。
- mod は、会話の抜粋を Haiku に送信します。送信には、セッションと同じ API クライアントと認証情報を使います。
- `/rename` を引数なしで 1 回実行するたびに、Haiku の呼び出しが 1 回発生します。

## 更新とアンインストール

マーケットプレイスとプラグインを更新した後、Claude Code を再起動してください。
以前の配布元（`main` の相対パス）からインストールした場合も、同じコマンドで公開版の配布元へ切り替わります。

```sh
claude plugin marketplace update tomatoaiu-mods
claude plugin update rename-ja@tomatoaiu-mods
```

アンインストールする場合は、次のコマンドを実行します。

```sh
claude plugin uninstall rename-ja@tomatoaiu-mods
```

## 開発とリリース

Node.js 24 以降で、バージョン情報の整合性と hook のテストを実行できます。
依存パッケージのインストールは不要です。

```sh
npm run check
```

Claude Code がある環境では、マニフェストも検証できます。
この検証と上記のテストだけでは、early access の function hooks が実際に読み込まれることまでは確認できません。

```sh
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir .
```

バージョンは SemVer（`0.1.0` など）で管理します。
Release Please が Conventional Commits から次のバージョンと変更履歴を含む PR を作成します。
所有者がその PR をマージすると、Release workflow が検証、ZIP の作成、署名付き provenance の生成を実行し、ZIP とチェックサムを Immutable Release として公開します。
workflow は公開版の署名を検証した後、`stable` を更新します。
初回公開と GitHub の設定は、[リリース手順](docs/releasing.md)を参照してください。
変更履歴は [CHANGELOG.md](CHANGELOG.md) に記録します。

## ライセンス

[MIT](LICENSE)
