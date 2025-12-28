# Workflow Telemetry Action - アーキテクチャ

## 概要

GitHub Actionsワークフローの実行時テレメトリを収集・可視化するアクション。
以下の3種類のデータを収集します：

- **Step Trace**: ワークフローステップの実行時間（Mermaid Ganttチャート）
- **System Metrics**: CPU、メモリ、ネットワーク、ディスクI/O（QuickChart.io グラフ）
- **Process Trace**: 実行中のプロセス情報（Linux/Ubuntu のみ）

## ディレクトリ構造（機能ベース・縦割り）

```
src/
├── entry/                # アクションのエントリーポイント
│   ├── main.ts          # 起動時（pre）- 各機能を開始
│   └── post.ts          # 終了時（post）- データ収集とレポート生成
├── features/            # 機能モジュール（縦割り）
│   ├── step/           # Step Trace機能
│   │   └── stepTracer.ts         # ステップ実行時間の追跡
│   ├── process/        # Process Trace機能
│   │   └── processTracer.ts      # プロセス実行の追跡
│   └── stats/          # System Metrics機能
│       ├── collector.ts          # メトリクス収集（メインプロセス）
│       ├── backgroundCollector.ts # バックグラウンドメトリクス収集（別プロセス）
│       └── chartGenerator.ts     # QuickChart.io APIでグラフ生成
├── utils/              # 共通ユーティリティ
│   └── logger.ts       # ログ出力ラッパー
└── interfaces/         # 型定義
    └── index.ts        # TypeScript型定義
```

**設計思想**: 各機能（step/process/stats）が独立したモジュールとして完結し、関連するコードが1つのディレクトリにまとまっています。

## アーキテクチャ概要

### 実行フロー

```
┌─────────────────┐
│   main.ts       │  ← GitHub Actions "pre" フェーズ
│   (起動時)      │
└────────┬────────┘
         │
         ├─→ stepTracer.start()      - 準備のみ（実データはGitHub APIから取得）
         ├─→ statCollector.start()   - 子プロセス起動（backgroundCollector.ts）
         └─→ processTracer.start()   - プロセス監視開始（1秒間隔）

         ... ワークフロー実行中 ...

┌─────────────────┐
│   post.ts       │  ← GitHub Actions "post" フェーズ
│   (終了時)      │
└────────┬────────┘
         │
         ├─→ stepTracer.finish() + report()    - GitHub APIからステップ情報取得
         ├─→ statCollector.finish() + report() - ファイルからメトリクス読み込み
         ├─→ processTracer.finish() + report() - ファイルからプロセスデータ読み込み
         │
         └─→ reportAll()  - PR コメント / Job Summary に出力
```

## 主要コンポーネント

### 1. Step Tracer (`features/step/stepTracer.ts`)

**役割**: GitHub Actionsのステップ実行時間を可視化

- **データ源**: GitHub API（`WorkflowJobType`）
- **処理**:
  - `start()`: 何もしない（準備のみ）
  - `finish()`: 何もしない
  - `report()`: GitHub APIから取得したジョブ情報からMermaid Ganttチャートを生成
- **出力**: Mermaid Gantt chart

### 2. Process Tracer (`features/process/processTracer.ts`)

**役割**: 実行中のプロセスを監視・記録

- **データ源**: `systeminformation.processes()`
- **処理**:
  - `start()`: 1秒間隔でプロセス情報を収集開始
  - 各プロセスのPID、名前、CPU/メモリ使用率、開始/終了時刻を記録
  - データをファイル（`proc-tracer-data.json`）に保存
  - `finish()`: 収集停止、最終データ保存
  - `report()`: トップN件のGanttチャート + 全プロセス詳細テーブル
- **出力**: Mermaid Gantt chart + ASCIIテーブル
- **プラットフォーム**: Linux/Ubuntu のみ

### 3. Stat Collector (`features/stats/collector.ts` + `features/stats/backgroundCollector.ts`)

**役割**: システムメトリクスをリアルタイム収集

#### アーキテクチャ: ファイルベースモデル

```
┌──────────────────────────────┐
│ features/stats/collector.ts │  ← メインプロセス
│                              │
│ - spawn backgroundCollector  │  子プロセスとしてバックグラウンド収集起動
│ - ファイルからデータ読み込み  │  stats-data.json
│ - グラフ生成依頼             │  chartGenerator経由でQuickChart API呼び出し
└──────────┬───────────────────┘
           │
           │ File I/O (stats-data.json)
           ▼
┌──────────────────────────────────────┐
│ features/stats/backgroundCollector.ts│  ← バックグラウンドプロセス
│                                      │
│ - 定期収集 (5秒)                      │  systeminformationでメトリクス取得
│ - データ蓄積                          │  配列に保存
│ - ファイルに保存                      │  stats-data.json へ書き込み
└──────────────────────────────────────┘
```

#### なぜ別プロセス？

- **detached プロセス**: main.tsが終了してもバックグラウンドで動作継続
- **独立性**: ワークフロー実行中もメトリクスを収集し続ける
- **post.ts で回収**: 終了時にファイルからデータ読み込み

#### なぜファイルベース？

- **シンプル**: HTTPサーバー不要、ポート管理不要
- **一貫性**: processTracerと同じパターン
- **安定性**: ポート競合のリスクなし

#### 収集するメトリクス

1. **CPU**: User/System Load (%)
2. **Memory**: Active/Available (MB)
3. **Network I/O**: Read/Write (MB/s)
4. **Disk I/O**: Read/Write (MB/s)
5. **Disk Size**: Used/Available (MB)

- **出力**: QuickChart.io で生成したグラフ（ダーク/ライトモード対応）

### 4. Chart Generator (`features/stats/chartGenerator.ts`)

**役割**: QuickChart.io APIでグラフ生成

- **入力**: ProcessedStats（時系列データ）
- **出力**: HTMLの`<picture>`タグ（ダーク/ライトモード対応）
- **グラフタイプ**:
  - Line Graph: Network I/O, Disk I/O
  - Stacked Area Graph: CPU、Memory、Disk Size
- **配置理由**: stats機能でのみ使用されるため、`features/stats/`内に配置

## ビルド構成

### Rollup設定 (`rollup.config.mjs`)

3つの独立したバンドルを生成：

| エントリーポイント | 出力 | 用途 |
|---|---|---|
| `src/entry/main.ts` | `dist/main/index.js` | アクション起動時（pre） |
| `src/entry/post.ts` | `dist/post/index.js` | アクション終了時（post） |
| `src/features/stats/backgroundCollector.ts` | `dist/scw/index.js` | メトリクス収集バックグラウンドプロセス |

**重要**: `backgroundCollector.ts`は`collector.ts`で`spawn()`により別プロセスとして起動されるため、独立したバンドルが必要。

## データフロー

### 起動時（main.ts）

```
main.ts
  ├─→ stepTracer.start()       準備のみ
  ├─→ statCollector.start()    spawn("dist/scw/index.js") → バックグラウンド収集開始
  └─→ processTracer.start()    setInterval(1000ms) → プロセス監視開始
```

### 終了時（post.ts）

```
post.ts
  │
  ├─→ GitHub API → currentJob取得
  │
  ├─→ stepTracer.report(currentJob)
  │     └─→ Mermaid Ganttチャート生成
  │
  ├─→ statCollector.report(currentJob)
  │     ├─→ stats-data.json読み込み
  │     └─→ chartGenerator → QuickChart API → グラフURL
  │
  ├─→ processTracer.report(currentJob)
  │     ├─→ proc-tracer-data.json読み込み
  │     └─→ Gantt + テーブル生成
  │
  └─→ reportAll(content)
        ├─→ Job Summary (core.summary)
        └─→ PR Comment (octokit.rest.issues.createComment)
```

## 設定項目 (`action.yml`)

| 入力 | デフォルト | 説明 |
|------|----------|------|
| `github_token` | `${{ github.token }}` | GitHub API アクセストークン |
| `metric_frequency` | `5` | メトリクス収集間隔（秒） |
| `proc_trace_min_duration` | `-1` | プロセストレース最小実行時間（ms）|
| `proc_trace_chart_show` | `true` | プロセスGanttチャート表示 |
| `proc_trace_chart_max_count` | `10` | チャート表示プロセス数 |
| `proc_trace_table_show` | `false` | プロセステーブル表示 |
| `comment_on_pr` | `true` | PRコメント投稿 |
| `job_summary` | `true` | Job Summary投稿 |

## 技術スタック

- **言語**: TypeScript (strict mode)
- **ランタイム**: Node.js v24
- **ビルド**: Rollup
- **ライブラリ**:
  - `@actions/core`: GitHub Actions API
  - `@actions/github`: GitHub REST API (Octokit)
  - `systeminformation`: システムメトリクス取得
  - QuickChart.io: グラフ生成（外部API）

## 制限事項

1. **Process Trace**: Linux/Ubuntu環境のみ対応
   - `/home/runner/work/_actions/` パスに依存
2. **QuickChart.io**: 外部APIへの依存（障害時はグラフが表示されない）

## 完了した改善

1. ✅ **HTTPサーバーからファイルベースへの移行** (2025-12-28)
   - ポート管理の複雑さを削減
   - processTracerと一貫したアーキテクチャ
2. ✅ **グローバル状態のカプセル化** (2025-12-28)
   - ProcessTracerクラス化
   - StatsBackgroundCollectorクラス化

## 今後の改善案

1. エラーハンドリングの強化（fetchStats のタイムアウト、リトライ）
2. 設定管理の一元化（ActionConfigクラス）
3. マジックナンバーの定数化
4. Ganttチャート生成の重複削除（stepTracer, processTracer）
