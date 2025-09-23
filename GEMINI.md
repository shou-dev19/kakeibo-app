# Gemini コンテキスト: kakeibo-app

## プロジェクト概要

このプロジェクトは、Google Apps Script (GAS) を利用したサーバーレスの家計簿アプリケーションです。クレジットカードや銀行の取引明細CSVをGoogle Drive経由でインポートし、GoogleスプレッドシートをUIおよびデータベースとして使用して、家計の収支管理と可視化を行います。

- **主要技術**: Google Apps Script, Google スプレッドシート, Google Drive
- **アーキテクチャ**: サーバーレス。ビジネスロジックはGASに集約し、UIとDBはスプレッドシートが担います。
- **コア機能**:
    - CSVインポートと自動データ整形
    - ルールに基づく費目の自動分類
    - 月次収支レポート、資産推移グラフの生成

## ビルドと実行

このプロジェクトはまだ開発環境の構築が完了していません。`docs/tasks.md` に基づき、以下の手順でセットアップと開発を進めることが想定されています。

### **TODO: 開発環境のセットアップ**

1.  **`clasp` のインストール**:
    ```bash
    npm install -g @google/clasp
    ```
2.  **Googleアカウントへのログイン**:
    ```bash
    clasp login
    ```
3.  **Google Cloud Platform (GCP) でのAPI有効化**:
    - Google Drive API
    - Google Sheets API
    - Apps Script API
    (上記APIを有効化し、`clasp` がアクセスできるように設定が必要です)

4.  **プロジェクトの作成とクローン**:
    - Googleスプレッドシートを新規作成します。
    - `clasp` を使って、そのスプレッドシートに紐づくGASプロジェクトを作成します。
    ```bash
    # "standalone" は適宜 "sheets" などに変更
    clasp create --type standalone --title "kakeibo-app"
    ```
    - 作成されたプロジェクトをローカルにクローン（または `pull`）します。

### **開発ワークフロー**

- **コードのデプロイ**:
  ```bash
  # ローカルの変更をGASプロジェクトにアップロード
  clasp push
  ```
- **GASエディタを開く**:
  ```bash
  # ブラウザでGASエディタを開く
  clasp open
  ```

## 開発規約

`docs/design.md` で定義されている以下の規約に従って開発を進めます。

- **ディレクトリ構成**:
  ```
  .
  ├── appsscript.json  (マニフェストファイル)
  └── src/
      ├── Main.gs
      ├── Triggers/
      ├── Services/
      └── Repositories/
  ```
- **ファイル命名規則**:
    - ロジックの役割に応じてプレフィックスを付けます (例: `Service_CsvImporter.gs`, `Repository_Spreadsheet.gs`)。
- **リポジトリパターン**:
    - `Repository_Spreadsheet.gs` のように、スプレッドシートへのデータアクセスを抽象化するモジュールを設けます。
- **テスト**:
    - `tests/` ディレクトリ配下に単体テストを実装することが計画されています。
