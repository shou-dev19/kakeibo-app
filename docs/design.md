# **家計簿アプリ 設計書**

## **1. はじめに**

本ドキュメントは、[要件定義書](./requirements.md)に基づき、家計簿アプリケーションの技術アーキテクチャとシステム設計を定義するものである。

## **2. システムアーキテクチャ**

### **2.1. 概要**

本システムは、Google Apps Script (GAS)、Google スプレッドシート、Google Drive を中核としたサーバーレスアーキテクチャを採用する。
利用者は Google スプレッドシートをインターフェースとして操作し、全ての処理は Google のクラウド環境で実行される。

```mermaid
graph TD
    A[利用者] -- 操作 --> B(Googleスプレッドシート);
    B -- メニュー実行 --> C{Google Apps Script};
    C -- 読み書き --> D[Googleスプレッドシート(DB)];
    C -- 読み込み --> E[Google Drive上のCSV/設定ファイル];
    C -- 結果を反映 --> B;
```

### **2.2. 処理フロー**

1.  **データインポート**: 利用者が Google Drive の特定フォルダに CSV ファイルをアップロードすると、GAS のトリガーが発動する。GAS はファイルを解析・整形し、Google スプレッドシート（DB）にデータを格納する。
2.  **レポート閲覧**: 利用者がスプレッドシートのカスタムメニューから「月次レポート表示」などを選択する。GAS が実行され、スプレッドシート（DB）のデータを集計・加工し、指定のレポート用シートに結果を出力する。

## **3. コンポーネント設計**

### **3.1. Google スプレッドシート**

UI（ユーザーインターフェース）とデータベースの 2 つの役割を担う。以下のシートで構成する。

- `DB_Transactions`: 全ての取引明細データを時系列で格納するマスターデータベースシート。
- `Report_MonthlySummary`: 月次収支レポート（F-04）の出力先シート。
- `Report_TransactionList`: 月次明細一覧（F-05）の出力先シート。
- `Report_AssetTransition`: 資産推移グラフ（F-07）の出力先シート。
- `Settings`: カテゴリ分類ルールや、各金融機関の CSV フォーマット定義など、利用者が編集可能な設定を管理するシート。

### **3.2. Google Apps Script (GAS)**

アプリケーションのビジネスロジック全体を担う。メンテナンス性を考慮し、機能ごとにスクリプトファイルを分割して管理する。

- `Main.gs`: スプレッドシートのカスタムメニュー作成、`onOpen`や`onEdit`などのトリガー設定、全体を統括するエントリーポイント。
- `Trigger_CsvImport.gs`: Google Drive のファイル追加を監視し、インポート処理をキックするトリガー関連の処理。
- `Service_CsvImporter.gs`: CSV ファイルの解析、データ整形、共通フォーマットへの変換処理（F-01, F-02）。
- `Service_Categorizer.gs`: `Settings`シートのルールに基づき、取引内容からカテゴリを自動分類する処理（F-03）。
- `Service_ReportGenerator.gs`: 各種レポート（月次収支、明細一覧、資産推移）を生成する処理（F-04, F-05, F-07）。
- `Service_SplitwiseCalculator.gs`: 割り勘計算処理（F-06）。
- `Repository_Spreadsheet.gs`: スプレッドシートへのデータ読み書きを抽象化するラッパーモジュール。

### **3.3. Google Drive**

外部ファイル（CSV、設定ファイル）の置き場所として利用する。

- `/家計簿アプリ/csv-import`: 金融機関からダウンロードした CSV ファイルを格納するフォルダ。`Trigger_CsvImport.gs`の監視対象となる。GoogleDrive は以下のような構成を想定。

```
家計簿アプリ
├── kakeibo-app (スプレッドシート)
├── csv-import/
│   ├── 銀行A/
│   │   ├── 2025年1月分の明細ファイル（csv）
│   │   ├── 2025年2月分の明細ファイル（csv）
│   │   ├~~~~~~~~~~~~~~~~~~~~~~~~~~~~
│   │   ├── 2025年12月分の明細ファイル（csv）
│   │   └── imported/
│   │       └── 2024年12月分の明細ファイル（csv）
│   ├── クレジットカード会社B/
│   │   ├── 2025年1月分の明細ファイル（csv）
│   │   ├── 2025年2月分の明細ファイル（csv）
│   │   ├~~~~~~~~~~~~~~~~~~~~~~~~~~~~
│   │   ├── 2025年12月分の明細ファイル（csv）
│   │   └── imported/
│   │       └── 2024年12月分の明細ファイル（csv）
│   ├── クレジットカード会社C/
│   │   ├── 2025年1月分の明細ファイル（csv）
│   │   ├── 2025年2月分の明細ファイル（csv）
│   │   ├~~~~~~~~~~~~~~~~~~~~~~~~~~~~
│   │   ├── 2025年12月分の明細ファイル（csv）
│   │   └── imported/
│   │       └── 2024年12月分の明細ファイル（csv）
```

- `/家計簿アプリ/settings`: 将来的に、より複雑な設定を JSON などで管理する場合に使用するフォルダ。

## **4. データフロー設計**

### **4.1. CSV インポート処理**

1.  利用者が`/家計簿アプリ/csv-import`フォルダに CSV ファイルをアップロードする。
2.  GAS のトリガーが発動し、`Trigger_CsvImport.gs`が実行される。
3.  `Service_CsvImporter.gs`が CSV ファイルを読み込み、`Settings`シートの定義を基に共通フォーマットに変換する。
4.  `Service_Categorizer.gs`が変換後のデータにカテゴリを付与する。
5.  `Repository_Spreadsheet.gs`を介して、`DB_Transactions`シートに最終的なデータが追記される。

### **4.2. レポート生成処理**

1.  利用者がスプレッドシートのメニューから「月次レポート」を選択する。
2.  `Main.gs`がリクエストを受け付け、`Service_ReportGenerator.gs`を呼び出す。
3.  `Service_ReportGenerator.gs`は`Repository_Spreadsheet.gs`を介して`DB_Transactions`シートから必要なデータを取得する。
4.  取得したデータを集計・加工し、`Report_MonthlySummary`シートに結果を書き込む。

## **5. プロジェクトのディレクトリ構成**

Google Apps Script のオンラインエディタ（clasp を利用したローカル開発環境を想定）におけるプロジェクトのファイル構成は以下の通りとする。

```
.
├── appsscript.json  (マニフェストファイル)
├── src/
│   ├── Main.gs
│   ├── Triggers/
│   │   └── Trigger_CsvImport.gs
│   ├── Services/
│   │   ├── Service_CsvImporter.gs
│   │   ├── Service_Categorizer.gs
│   │   ├── Service_ReportGenerator.gs
│   │   └── Service_SplitwiseCalculator.gs
│   └── Repositories/
│       └── Repository_Spreadsheet.gs
└── tests/
    ├── test_runner.gs
    └── ... (各Serviceの単体テスト)
```
