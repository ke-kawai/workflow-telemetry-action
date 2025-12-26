# workflow-telemetry-action 完全内製化計画

## 現状の問題点

このプロジェクトには2つの主要な外部依存があります：

### 1. proc-tracerバイナリ（非公開）
- **場所**: `dist/proc-tracer/proc_tracer_ubuntu-20`, `dist/proc-tracer/proc_tracer_ubuntu-22`
- **使用箇所**: `src/processTracer.ts`
- **機能**: Linuxプロセスをトレースし、EXEC/EXITイベントをJSON形式で出力
- **問題**: バイナリが公開されていないため、メンテナンス・拡張が不可能

### 2. 外部グラフ生成サービス（停止中）
- **URL**: `https://api.globadge.com/v1/chartgen/`
- **使用箇所**: `src/statCollector.ts` (358行目、413行目)
- **機能**: メトリクスデータから画像グラフ（ライン、スタックドエリア）を生成
- **問題**: サービスが現在停止しており、利用不可能

## 内製化の方針

TypeScriptで全機能を再実装し、外部依存を排除します。

---

## 必要な変更

### Phase 1: プロセストレーサーの内製化

#### 1.1 新規ファイル作成

**`src/nativeProcessTracer.ts`** - プロセストレース実装
```typescript
// 実装方針:
// - /proc filesystem監視による軽量実装
// - child_processで `ps` コマンドを定期実行
// - または auditd/ebpf wrapper（より高度）
```

**必要な機能**:
- プロセスの開始/終了イベントをキャプチャ
- 以下の情報を収集:
  - プロセス名、PID、PPID
  - UID（ユーザーID）
  - 開始時刻、終了時刻、実行時間
  - 終了コード
  - 実行ファイルパスと引数
- JSON形式で出力（既存の`procTraceParser.ts`と互換性を保つ）

**実装オプション**:

**オプションA（推奨）**: `/proc` filesystem + `ps` コマンド
- 軽量で依存関係が少ない
- 定期的にプロセスリストをスナップショット
- プロセスの差分から開始/終了を検出

**オプションB**: `child_process.spawn` ラッパー
- GitHub Actionsワークフロー内の全コマンドをラップ
- より正確なトレースが可能
- 実装がやや複雑

**オプションC**: `auditd` ラッパー
- Linuxのauditサブシステムを利用
- 最も正確だが、root権限と追加設定が必要

#### 1.2 既存ファイル修正

**`src/processTracer.ts`**:
```typescript
// 変更内容:
// - バイナリ起動処理を削除
// - nativeProcessTracer.tsのAPIを呼び出すように変更
// - 出力フォーマットは維持（procTraceParser.tsとの互換性）
```

#### 1.3 削除するファイル
- `dist/proc-tracer/proc_tracer_ubuntu-20`
- `dist/proc-tracer/proc_tracer_ubuntu-22`

---

### Phase 2: グラフ生成の内製化

#### 2.1 新規ファイル作成

**`src/chartGenerator.ts`** - チャート生成実装
```typescript
// 実装方針:
// オプションA: Mermaid形式に統一（最もシンプル）
// オプションB: Chart.js + canvas でPNG生成
// オプションC: QuickChart API（無料・オープンソース代替）
```

**必要な機能**:
- ラインチャート生成（Network I/O, Disk I/O用）
- スタックドエリアチャート生成（CPU, Memory, Disk Usage用）
- 時系列データの可視化
- ダークモード/ライトモード対応

**実装オプション**:

**オプションA（最もシンプル）**: Mermaid形式に統一
```typescript
// メリット:
// - 既にStep TraceとProcess Traceで使用中
// - GitHubが標準対応
// - 実装が簡単
// - 外部依存なし

// デメリット:
// - メトリクスグラフの表現力がやや限定的
```

**オプションB（推奨）**: QuickChart API
```typescript
// URL: https://quickchart.io (オープンソース、自己ホスト可能)
// メリット:
// - Chart.jsベースで高品質
// - 無料で利用可能
// - 既存のapi.globadge.comからの移行が容易
// - 必要に応じて自己ホスト可能

// デメリット:
// - 外部APIへの依存（ただしオープンソース）
```

**オプションC**: Chart.js + node-canvas
```typescript
// メリット:
// - 完全内製、外部依存なし
// - 高いカスタマイズ性

// デメリット:
// - node-canvasのネイティブ依存（cairo）が必要
// - バイナリサイズ増加
// - GitHub Actionsランナーへの追加インストールが必要
```

**オプションD**: データURLエンコード + SVG
```typescript
// メリット:
// - 完全内製
// - ネイティブ依存なし
// - SVGなのでスケーラブル

// デメリット:
// - 実装がやや複雑
// - 既存のChart.jsライクなAPIがない
```

#### 2.2 既存ファイル修正

**`src/statCollector.ts`**:
```typescript
// 変更内容:
// - getLineGraph() を削除または書き換え
// - getStackedAreaGraph() を削除または書き換え
// - chartGenerator.ts のAPIを呼び出すように変更
// - axios による外部API呼び出しを削除
```

#### 2.3 依存関係の追加/削除

**削除（不要になる場合）**:
```json
"axios": "^1.1.2"  // グラフAPIのみに使用している場合
```

**追加（実装オプションによる）**:

*オプションA（Mermaid）の場合*:
```json
// 追加パッケージなし
```

*オプションB（QuickChart）の場合*:
```json
"quickchart-js": "^3.1.3"
// または単純にaxiosでAPIコール
```

*オプションC（Chart.js + canvas）の場合*:
```json
"chart.js": "^4.4.0",
"canvas": "^2.11.2",
"chartjs-node-canvas": "^4.1.6"
```

*オプションD（SVG）の場合*:
```json
"d3": "^7.8.5"  // オプション、SVG生成を簡単にするため
```

---

### Phase 3: 統合とテスト

#### 3.1 ビルド設定の更新

**`package.json`**:
```json
{
  "scripts": {
    // 必要に応じてビルドスクリプトを更新
  },
  "dependencies": {
    // 選択した実装オプションに応じて更新
  }
}
```

#### 3.2 GitHub Actions ワークフローの更新

**`.github/workflows/`** 内のワークフロー:
- 新しい実装に必要なシステム依存をインストール
- 例: node-canvasを使用する場合、`sudo apt-get install build-essential libcairo2-dev`

#### 3.3 ドキュメント更新

**`README.md`**:
- 内製化についての記述を追加
- システム要件の更新（必要な場合）

---

## 推奨実装プラン

### 最小実装（最速）
1. **プロセストレーサー**: オプションA（/proc + ps）
2. **グラフ生成**: オプションA（Mermaid統一）
3. **想定工数**: 2-3日

### バランス型（推奨）
1. **プロセストレーサー**: オプションA（/proc + ps）
2. **グラフ生成**: オプションB（QuickChart API）
3. **想定工数**: 3-4日
4. **将来的に自己ホスト可能**

### 完全内製型
1. **プロセストレーサー**: オプションB（spawn wrapper）
2. **グラフ生成**: オプションD（SVG生成）
3. **想定工数**: 5-7日
4. **外部依存ゼロ、完全制御可能**

---

## 実装ステップ

### ステップ1: プロセストレーサー実装
1. `src/nativeProcessTracer.ts` 作成
2. `/proc` ベースの監視ロジック実装
3. 既存のJSON形式でイベント出力
4. `src/processTracer.ts` を修正して新実装を使用
5. テスト実行

### ステップ2: グラフ生成実装
1. `src/chartGenerator.ts` 作成
2. 選択したオプションでチャート生成実装
3. `src/statCollector.ts` を修正して新実装を使用
4. テスト実行

### ステップ3: 統合テスト
1. サンプルワークフローで動作確認
2. 各種メトリクスが正しく表示されるか確認
3. プロセストレースが正しく機能するか確認

### ステップ4: クリーンアップ
1. 不要なバイナリファイル削除
2. 不要な依存関係削除
3. ドキュメント更新
4. リリース

---

## データ形式仕様

### プロセストレースJSON形式（互換性維持）
```json
{
  "event": "EXEC",
  "ts": "2024-01-01T12:00:00Z",
  "name": "npm",
  "pid": 1234,
  "ppid": 1000,
  "uid": 1000,
  "startTime": 1704110400000,
  "fileName": "/usr/bin/npm",
  "args": ["install"]
}

{
  "event": "EXIT",
  "pid": 1234,
  "duration": 5000,
  "exitCode": 0
}
```

### グラフデータ形式
```typescript
interface ProcessedStats {
  x: number  // タイムスタンプ
  y: number  // 値
}

interface LineGraphOptions {
  label: string
  axisColor: string
  line: {
    label: string
    color: string
    points: ProcessedStats[]
  }
}

interface StackedAreaGraphOptions {
  label: string
  axisColor: string
  areas: Array<{
    label: string
    color: string
    points: ProcessedStats[]
  }>
}
```

---

## セキュリティ考慮事項

1. **プロセストレース**:
   - sudo権限の使用を最小化
   - 機密情報（環境変数、引数内のトークン等）のフィルタリング

2. **グラフ生成**:
   - 外部APIを使用する場合、データ送信内容の確認
   - 可能な限り内製実装を優先

3. **ログ出力**:
   - デバッグ情報に機密データを含めない

---

## テスト計画

### ユニットテスト
- `nativeProcessTracer.ts`: プロセスイベントのキャプチャ
- `chartGenerator.ts`: グラフ生成ロジック
- `procTraceParser.ts`: 既存のパーサーとの互換性

### 統合テスト
- 実際のGitHub Actionsワークフローで実行
- 各メトリクスの収集と表示
- プロセストレースの精度

### 対応環境
- Ubuntu 20.04
- Ubuntu 22.04
- Ubuntu 24.04（将来対応）

---

## マイルストーン

- [ ] Phase 1: プロセストレーサー実装完了
- [ ] Phase 2: グラフ生成実装完了
- [ ] Phase 3: 統合テスト完了
- [ ] Phase 4: ドキュメント更新
- [ ] Phase 5: リリース準備

---

## 参考資料

### プロセストレース
- [Linux /proc filesystem](https://man7.org/linux/man-pages/man5/proc.5.html)
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [auditd documentation](https://linux.die.net/man/8/auditd)

### グラフ生成
- [QuickChart.io](https://quickchart.io/)
- [Chart.js](https://www.chartjs.org/)
- [Mermaid](https://mermaid.js.org/)
- [D3.js](https://d3js.org/)

### GitHub Actions
- [Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Creating actions](https://docs.github.com/en/actions/creating-actions)
