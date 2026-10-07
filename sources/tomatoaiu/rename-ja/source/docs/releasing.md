# リリース手順

## バージョンと配布元

Claude Code は、プラグインの `version` が変わったときにキャッシュを更新します。
GitHub Release を作成するだけでは、プラグインの更新にはなりません。
このリポジトリでは `.claude-plugin/plugin.json` の `version` を Claude Code 向けのバージョンとし、Release Please が次のファイルを同時に更新します。

- `.claude-plugin/plugin.json`：Claude Code が読むバージョン。
- `package.json`：開発用パッケージのバージョン。`private: true` のため npm には公開しない。
- `.release-please-manifest.json`：Release Please が管理するバージョン。
- `CHANGELOG.md`：変更履歴。

マーケットプレイスのプラグイン項目には、`version` を重複して記載しません。
Claude Code では `plugin.json` の値が優先されるためです。
`npm run check` は、上記 3 か所のバージョンが一致していることを検証します。

配布元は `.claude-plugin/marketplace.json` の GitHub source で指定した `stable` ブランチです。
相対パス `./` で `main` を配布すると、新規インストールには未公開のコードが入り、既存ユーザーには同じバージョンの古いキャッシュが残る可能性があります。
Release workflow は、検証と GitHub Release の公開が成功してから `stable` を公開コミットへ進めます。
通常の開発では `main` を更新し、`stable` には直接コミットしません。

GitHub Release には `v0.1.0` のようなタグとリリースノートに加え、プラグインの ZIP と `SHA256SUMS` を公開します。
build job はテスト後に公開コミットから ZIP を作成し、署名付きの build provenance を生成します。
publish job はチェックサムと provenance を検証してから Immutable Release を公開し、公開した ZIP とリリースの署名も検証します。
通常の Claude Code インストールは ZIP ではなく、`stable` からプラグインを取得します。

## GitHub の初期設定

1. この設定を `tomatoaiu/rename-ja` の `main` に反映します。
2. **Settings → Actions → General → Workflow permissions** で **Allow GitHub Actions to create and approve pull requests** を有効にします。
3. `main` の保護ルールを使う場合は、所有者が Release Please の PR をマージできるようにします。
4. `stable` の作成と fast-forward 更新、`v*` タグの作成を妨げる ruleset がないことを確認します。
5. **Settings → General → Releases** で **Immutable Releases** を有効にします。

workflow は GitHub の標準 `GITHUB_TOKEN` を使います。
PAT や npm の認証情報は不要です。
書き込み権限はリリース用の job にだけ付与します。
Immutable Releases は有効のままにしてください。
無効の場合、公開後の署名検証が失敗し、workflow は `stable` を更新しません。
この workflow 自体は、リポジトリの設定を変更しません。

## 初回の 0.1.0

最初の `stable` ブランチは、初回公開の最後に作成されます。
**初回公開が成功するまでは、README の通常インストールは使えません。**
ローカルで試す場合は、`claude --plugin-dir .` を使ってください。

1. `npm run check` と Claude Code での `/rename` の動作を確認します。
2. `main` に変更を反映します。
3. 所有者が **Actions → Release → Run workflow** で `main` を選び、`release_sha` を空にして実行します。
4. workflow の成功と、`v0.1.0` の GitHub Release、ZIP、`SHA256SUMS` および `stable` の作成を確認します。

GitHub CLI からも開始できます。

```sh
gh workflow run release.yml --repo tomatoaiu/rename-ja --ref main
```

この段階では、Prepare release workflow は次のバージョンの PR を作成しません。
初回の GitHub Release ができた後の `main` 更新から、リリース PR を作成します。

## 2 回目以降

`main` に入るコミットには Conventional Commits を使います。
PR を squash merge する場合は、PR のタイトルを次の形式にします。

| 形式 | バージョンの変更 |
| --- | --- |
| `fix: ...` | パッチ（例：`0.1.0` → `0.1.1`） |
| `feat: ...` | マイナー（例：`0.1.0` → `0.2.0`） |
| `feat!: ...` または `BREAKING CHANGE:` | メジャー（例：`0.1.0` → `1.0.0`） |

`docs:` や `chore:` だけの変更では、通常はリリース PR を作成しません。
所有者が `main` に変更を反映すると、Prepare release workflow がリリース PR を作成または更新します。
PR のバージョンと変更履歴を確認した後、所有者がマージしてください。
Release workflow は、マージコミットを検証してから公開します。

`GITHUB_TOKEN` が作成する PR では、PR 作成を契機とする別の workflow は起動しません。
リリース直前には必ずテストを実行しますが、マージ前の CI も必要な場合は **CI → Run workflow** でリリース PR の head ブランチを選んで実行してください。
通常のユーザー作成 PR では、CI が自動実行されます。

公開と同時期に次の変更を `main` へ入れた場合は、公開完了後に **Prepare release → Run workflow** を実行すると、その変更を次のリリース PR に取り込めます。

## 公開した ZIP の検証

GitHub CLI でファイルを取得し、チェックサムと署名を確認できます。
次の例は初回の `0.1.0` を検証します。

```sh
gh release download v0.1.0 --repo tomatoaiu/rename-ja \
  --pattern 'rename-ja-0.1.0.zip' --pattern SHA256SUMS
sha256sum --check SHA256SUMS
gh release verify v0.1.0 --repo tomatoaiu/rename-ja
gh release verify-asset v0.1.0 rename-ja-0.1.0.zip --repo tomatoaiu/rename-ja
gh attestation verify rename-ja-0.1.0.zip --repo tomatoaiu/rename-ja
```

ZIP を展開したディレクトリは、`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir <展開先>` で試せます。
ZIP には、プラグインのマニフェスト、hook、ライセンスと説明文書を含めます。
CI 設定や開発用テストは含めません。

## 失敗した公開の再実行

初回の失敗は、元の Release workflow を再実行してください。
2 回目以降は、元の workflow を再実行するか、**Release → Run workflow** の `release_sha` に、マージ済みリリース PR の 40 桁のコミット SHA を指定します。
ブランチ名や未マージのコミットは受け付けません。

GitHub Release の公開後に署名検証、`stable` の更新、PR ラベルの削除が失敗しても、同じ SHA なら既存の公開版と ZIP の一致を確認して処理を続けます。
既存のタグが別の SHA を指している場合、公開前のタグだけが残っている場合、または `stable` が既に先へ進んでいる場合は停止します。
この場合は GitHub 上の状態を確認し、公開済みタグを上書きせずに対処してください。

## 確認した公式仕様

- [Claude Code: plugin.json の version](https://code.claude.com/docs/en/plugins/manifest-reference#version)
- [Claude Code: バージョンの判定順序と更新](https://code.claude.com/docs/en/plugins/loading#versions-and-updates)
- [Claude Code: 新しいバージョンの公開](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version)
- [Claude Code: GitHub source の ref](https://code.claude.com/docs/en/plugins/marketplace-reference#github-plugin-source)
- [Release Please: JSON ファイルの自動更新](https://github.com/googleapis/release-please/blob/v17.6.1/docs/customizing.md#updating-arbitrary-json-files)
- [Release Please Action: GITHUB_TOKEN の制限](https://github.com/googleapis/release-please-action/blob/v5.0.0/README.md#other-actions-on-release-please-prs)
