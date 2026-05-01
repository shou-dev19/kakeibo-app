# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A serverless household finance app built on Google Apps Script (GAS). It imports CSV transaction data from Google Drive, stores everything in a Google Spreadsheet (which serves as both the UI and database), and generates financial reports and asset visualizations.

## Development Workflow

This project uses [`clasp`](https://github.com/google/clasp) to sync local code with Google Apps Script.

```bash
# Push local changes to GAS
clasp push

# Open the GAS editor in the browser
clasp open

# Pull latest from GAS to local
clasp pull
```

There is no local test runner or build step. All code executes inside the Google Apps Script runtime. To test changes, push with `clasp push` and run functions directly from the GAS editor or trigger them via the spreadsheet menu ("家計簿アプリ").

The `.clasp.json` at the project root maps `scriptId` to the deployed GAS project and sets `rootDir` to `src/`.

## Architecture

The codebase follows a layered architecture with a single entrypoint:

```
src/
├── appsscript.json          # GAS manifest (timezone: Asia/Tokyo, runtime: V8)
├── Main.gs                  # Entrypoint: onOpen() menu, dialog handlers, initializeSheets()
├── Repositories/
│   └── Repository_Spreadsheet.gs  # All spreadsheet I/O + SHEET_NAMES constant
├── Services/
│   ├── Service_CsvImporter.gs     # CSV parsing and date normalization
│   ├── Service_Categorizer.gs     # Keyword-based transaction categorization
│   ├── Service_ReportGenerator.gs # Monthly/annual reports, asset/portfolio charts
│   └── Service_SplitwiseCalculator.gs  # Split-payment calculation
└── Triggers/
    └── Trigger_CsvImport.gs       # Time-driven trigger: auto-imports CSVs from Drive
```

**Data flow for CSV import:**
`Main.gs (importCsv)` → `Service_CsvImporter (parseCsv)` → `Service_Categorizer (categorizeTransactions)` → `Repository_Spreadsheet (appendTransactions)`

**Key architectural facts:**
- `SHEET_NAMES` (defined in `Repository_Spreadsheet.gs`) is a global constant used everywhere. All sheet names are in Japanese.
- The CSV format's `FormatName` value doubles as the Google Drive subfolder name used by the auto-import trigger — these must match exactly.
- Transaction row schema (8 columns): `[日付, 内容, 金額, 種別, 金融機関, カテゴリ, メモ, 残高]`
- CSV format definition schema (8 columns): `[FormatName, DateColumn, DescriptionColumn, ExpenseColumn, IncomeColumn, BalanceColumn, HeaderRows, Encoding]` — column indices are 1-based.
- Old 6-column CSV format definitions (without `BalanceColumn`) are patched at runtime by inserting an empty string at index 5.

## Script Properties

Two runtime configurations are read from GAS Script Properties (set via the GAS editor → Project Settings → Script Properties):

| Key | Purpose |
|-----|---------|
| `DRIVE_ROOT_FOLDER_ID` | Google Drive folder ID for auto-import trigger |
| `RULE_CSV_FILE_ID` | Google Drive file ID for bulk category rule updates |

## Settings Sheets

The `分類・除外設定` sheet (mapped as `SHEET_NAMES.SETTINGS`) has a dual-purpose layout:
- Columns A–B (rows 2+): keyword → category mapping rules
- Column E (rows 2+): categories excluded from monthly/annual balance calculations
- Column F (rows 2+): categories excluded specifically from the annual report

The category `振替` (transfer) is always excluded from balance calculations regardless of the settings sheet.
