# CI/CD セットアップガイド

voice-to-md プロジェクトの GitHub Actions による自動デプロイ手順をまとめる。

## 概要

```
[ローカル] TypeScript (src/) を編集
    ↓ git push (main ブランチ)
[GitHub Actions] npm ci → tsc ビルド → clasp push
    ↓
[Google Apps Script] 自動デプロイ完了
```

### ワークフローファイル

`.github/workflows/deploy.yml`

### トリガー条件

| トリガー | 条件 |
|---|---|
| 自動実行 | `main` ブランチへの push（`src/**`, `index.html`, `appsscript.json`, `tsconfig.json`, `package.json` の変更時） |
| 手動実行 | GitHub Actions タブから `workflow_dispatch` |

> ⚠️ `.github/workflows/**` のみの変更ではトリガーされない（意図的）

---

## ケース1: 初回セットアップ（未完了の場合）

### 1-1. GCP で OAuth クライアントを作成する

clasp のデフォルト OAuth クライアントはテストモードのため、リフレッシュトークンが **7日で失効** する。
自前の OAuth クライアントを「本番モード」で作成すれば **無期限** になる。

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. GAS プロジェクトに紐づいた GCP プロジェクトを選択（または新規作成）
3. **「APIとサービス」→「有効なAPIとサービス」** で **Google Apps Script API** を有効化
4. **「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」**
   - アプリケーションの種類: **デスクトップアプリ**
   - 名前: `clasp-ci`（任意）
5. 作成後、**JSON をダウンロード** → `creds.json` として保存

### 1-2. OAuth 同意画面を本番モードに設定する

| アカウント種別 | 設定方法 |
|---|---|
| Google Workspace | 「APIとサービス」→「OAuth同意画面」→ ユーザーの種類を **「内部」** に設定 |
| 個人 Gmail | 「APIとサービス」→「OAuth同意画面」→ **「外部」** で作成 → **「アプリを公開」** で本番モードに変更 |

> 💡 「公開」しても自分のクレデンシャルしか使わないため、外部ユーザーに影響はない

### 1-3. カスタムクレデンシャルで clasp にログイン

```bash
# ダウンロードした creds.json を使って認証（ブラウザが開く）
clasp login --creds creds.json
```

認証完了後、`~/.clasprc.json` に無期限のリフレッシュトークンが保存される。

### 1-4. GitHub Secrets に登録

```bash
# 認証情報を確認
cat ~/.clasprc.json
```

1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** をクリック
3. 登録内容:

| Name | Value |
|---|---|
| `CLASPRC_JSON` | `~/.clasprc.json` の中身をそのまま貼り付け |

### 1-5. 動作確認

```bash
# 手動でワークフローを実行
gh workflow run deploy.yml

# 実行状況を確認
gh run list --limit 5

# 最新の実行ログを確認
gh run view --log
```

または GitHub リポジトリの **Actions** タブから確認。

---

## ケース2: 通常のデプロイ（開発フロー）

```bash
# 1. コードを編集（src/ 配下）
# 2. コミット & プッシュ
git add .
git commit -m "feat: ○○機能を追加"
git push origin main

# 3. GitHub Actions が自動で実行される
# 4. 確認
gh run list --limit 1
```

> `src/` 配下のファイル変更がない push ではワークフローは実行されない

---

## ケース3: 手動でデプロイしたい

GitHub Actions を経由せず、ローカルから直接デプロイする場合。

```bash
# ビルド + デプロイ
npm run deploy
```

内部的には `tsc && cp index.html appsscript.json dist/ && clasp push` が実行される。

---

## ケース4: ワークフローの実行が失敗した

### 確認手順

```bash
# 直近の実行一覧
gh run list --limit 5

# 失敗した実行のログを確認（RUN_ID は上のコマンドで取得）
gh run view <RUN_ID> --log-failed
```

### よくある失敗原因

| エラー | 原因 | 対処 |
|---|---|---|
| `npm ci` 失敗 | `package-lock.json` が古い / 不整合 | ローカルで `npm install` → `package-lock.json` をコミット |
| `tsc` ビルドエラー | TypeScript の型エラー | ローカルで `npx tsc --noEmit` して修正 |
| `clasp push` 認証エラー | `CLASPRC_JSON` が未設定 or 期限切れ | ケース5 を参照 |
| ワークフローが実行されない | paths フィルターに該当しない変更のみ | `gh workflow run deploy.yml` で手動実行 |

---

## ケース5: clasp の認証トークンが期限切れになった

カスタム OAuth クライアント（本番モード）を使用していれば通常は発生しない。
clasp デフォルトの OAuth を使っている場合は 7日で失効するため、以下で再取得する。

```bash
# カスタムクレデンシャルの場合
clasp login --creds creds.json

# デフォルトの場合
clasp login
```

その後、`~/.clasprc.json` の内容で GitHub Secrets の `CLASPRC_JSON` を更新する。

```bash
# CLIから更新する場合
gh secret set CLASPRC_JSON < ~/.clasprc.json
```

---

## ケース6: GitHub Push Protection でプッシュがブロックされた

シークレット（API キーや Webhook URL）がコミット履歴に含まれている場合に発生。

### 対処法

```bash
# 1. 現在のファイルからシークレットを除去
# 2. 新しい履歴を作成
git checkout --orphan clean-main
git add -A
git commit -m "初回コミット（シークレット除去済み）"
git branch -D main
git branch -m main
git push --force origin main
```

> ⚠️ 漏洩したシークレットは無効化し、再発行すること

### 予防策

- シークレットは `PropertiesService.getScriptProperties()` で管理する（現在の `src/constants.ts` の方式）
- `.gitignore` に機密ファイルを追加する
- コミット前に `git diff --staged` でシークレットが含まれていないか確認する
