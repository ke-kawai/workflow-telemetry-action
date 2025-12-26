# リファクタリング提案

## 高優先度の改善

### 1. 統計処理関数の重複削除
**ファイル**: `src/features/stats/collector.ts` (195-307行目)

**問題点**:
- `getCPUStats`, `getMemoryStats`, `getNetworkStats`, `getDiskIOStats`, `getProcessStats`が同じパターンを繰り返している
- 各関数が似たような変換ロジックを持つ

**提案**:
- ジェネリック関数`transformStats`を作成して重複を削除
- データ駆動アプローチで設定を外部化

### 2. エラーハンドリングの改善
**ファイル**: `src/features/stats/collector.ts` (309-321行目)

**問題点**:
- `fetchStats`関数でHTTPステータスコードのチェックがない
- タイムアウト処理が実装されていない（定数は定義されているが未使用）
- ネットワークエラーのハンドリングがない
- サーバーの準備状態を確認していない

**提案**:
```typescript
async function fetchStats<T>(endpoint: string): Promise<T[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STATS_COLLECTION.REQUEST_TIMEOUT_MS);

    const response = await fetch(`http://localhost:${SERVER.PORT}/${endpoint}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error(`Failed to fetch stats from ${endpoint}: ${error}`);
    throw error;
  }
}
```

### 3. グローバル可変状態のカプセル化
**ファイル**:
- `src/features/process/processTracer.ts` (38-42行目)
- `src/features/stats/server.ts` (17-31行目)

**問題点**:
- モジュールレベルの可変状態がテストを困難にする
- カプセル化されていない
- 状態破損のリスク
- テスト間で状態をリセットするのが難しい

**提案**:
クラスベースの設計に変更：
```typescript
class ProcessTracer {
  private collectionInterval: NodeJS.Timeout | null = null;
  private trackedProcesses = new Map<number, TrackedProcess>();
  private completedProcesses: CompletedProcess[] = [];

  async start(): Promise<boolean> { ... }
  async finish(currentJob: WorkflowJobType): Promise<boolean> { ... }
  async report(currentJob: WorkflowJobType): Promise<string | null> { ... }
}
```

### 4. 型安全性の向上 ✅ 完了

#### A. `any`型の使用（22箇所） ✅
**問題点**:
- すべてのエラーハンドラで`catch (error: any)`を使用
- 型安全性が失われる

**提案**:
`unknown`型とtype guardを使用：
```typescript
catch (error: unknown) {
  if (error instanceof Error) {
    logger.error(error.message);
  }
}
```

#### B. logger.tsの型アサーション ✅
**ファイル**: `src/utils/logger.ts` (18行目)

**問題点**:
- `instanceof String`チェックは不要（Stringオブジェクトはほとんど使われない）
- 型アサーションが複数ある

**提案**:
```typescript
export function error(msg: string | Error): void {
  if (typeof msg === "string") {
    core.error(`${LOG_HEADER} ${msg}`);
  } else {
    core.error(`${LOG_HEADER} ${msg.name}`);
    core.error(msg);
  }
}
```

#### C. 型推論の問題 ✅
**ファイル**: `src/features/stats/server.ts` (34行目)

**問題点**:
```typescript
const statsCollectors: StatsCollector<any, any>[] = [...]
```

**提案**:
Union型またはベース型を作成して型安全性を向上

### 5. 複雑な関数の分割

#### A. `getCurrentJob()`
**ファイル**: `src/entry/post.ts` (16-62行目)
- 47行、ネストが3レベル
- リトライロジックとページネーションロジックが混在

**提案**:
```typescript
async function fetchJobPage(page: number): Promise<WorkflowJobType[]>
async function findCurrentJob(): Promise<WorkflowJobType | null>
async function getCurrentJobWithRetry(): Promise<WorkflowJobType | null>
```

#### B. `reportWorkflowMetrics()`
**ファイル**: `src/features/stats/collector.ts` (49-193行目)
- 144行
- データ取得、変換、チャート作成、フォーマットの複数責務

**提案**:
```typescript
async function fetchAllStats(): Promise<AllStats>
async function createMetricCharts(stats: AllStats): Promise<ChartUrls>
function formatMetricsReport(charts: ChartUrls): string
```

#### C. `report()` in processTracer
**ファイル**: `src/features/process/processTracer.ts` (225-375行目)
- 150行
- データ読み込み、パース、フィルタリング、チャート生成、テーブル生成、フォーマットの複数責務

**提案**:
```typescript
function loadProcessData(): ProcessData
function parseConfiguration(): ProcessTracerConfig
function generateProcessChart(processes: CompletedProcess[], config: Config): string
function generateProcessTable(processes: CompletedProcess[]): string
```

## 中優先度の改善

### 6. 共通エラーハンドリングパターンの抽出
すべての`start()`, `finish()`, `report()`関数が同じtry-catch構造を持つ

**提案**:
高階関数またはデコレータパターンで一貫したエラーハンドリングを実装

### 7. Ganttチャート生成の重複削除
**ファイル**:
- `src/features/step/stepTracer.ts`
- `src/features/process/processTracer.ts`

**提案**:
`MermaidGanttBuilder`クラスまたはユーティリティを作成

### 8. マジックナンバーの定数化
**ファイル**: `src/features/process/processTracer.ts` (320-337行目)

**問題点**:
テーブルカラム幅がハードコード (16, 7, 15, 10, 40)

**提案**:
```typescript
const TABLE_COLUMNS = {
  NAME_WIDTH: 16,
  PID_WIDTH: 7,
  START_TIME_WIDTH: 15,
  // ...
};
```

### 9. 不要な動的インポートの削除
**ファイル**: `src/features/stats/collector.ts` (309-321行目)

**問題点**:
- 不要なラッパー関数
- 動的インポートの価値がない（両関数が同じモジュールをインポート）

**提案**:
静的インポートを使用：
```typescript
import { getLineGraph, getStackedAreaGraph } from "./chartGenerator";
```

## 低優先度の改善

### 10. 文字列連結の改善
**パターン**: 複数ファイルで同様
```typescript
chartContent = chartContent.concat("gantt", "\n");
chartContent = chartContent.concat("\t", `title ${job.name}`, "\n");
```

**提案**:
テンプレートリテラルまたは配列joinを使用：
```typescript
const lines = [
  "gantt",
  `\ttitle ${job.name}`,
  `\tdateFormat x`,
  `\taxisFormat %H:%M:%S`
];
chartContent = lines.join("\n");
```

### 11. チャートの色定数化
カラーコード（`#be4d25`, `#6c25be`など）がインラインで複数回ハードコード

**提案**:
テーマ定数に抽出

### 12. ポート衝突処理
**問題点**: ポート7777が使用中の場合のフォールバック機構がない

**提案**:
- 複数ポートを試行、またはポート0で自動割り当て
- 環境変数経由でプロセス間でポート番号を渡す

## その他の懸念事項

### テストの欠如
- `package.json`: `"test": "echo \"Warn: no test specified\" && exit 0"`
- テストカバレッジがゼロ

### 入力バリデーションの欠如
ユーザー入力が十分に検証されていない：
```typescript
const metricFrequencyVal: number = parseInt(metricFrequencyInput);
if (Number.isInteger(metricFrequencyVal)) {
  metricFrequency = metricFrequencyVal * 1000;
}
```
負の数や妥当な範囲のチェックがない

### 外部API依存
QuickChart APIに依存、サービスダウン時のフォールバックなし

## 完了した改善

### 2025-12-27 (3): StatsCollector型の改善（項目4C）
- `statsCollectors`配列の型を`StatsCollector<any, any>[]`からUnion型に変更
- 新しい`AnyStatsCollector`型を作成：5つの具体的なStatsCollector型のUnion
- `statsCollectors`配列の型安全性を向上
- 型推論の問題を解決し、anyの使用を削減
- ビルドで検証済み（`npm run bundle`成功）

**実装内容**:
```typescript
type AnyStatsCollector =
  | StatsCollector<CPUStats, si.Systeminformation.CurrentLoadData>
  | StatsCollector<MemoryStats, si.Systeminformation.MemData>
  | StatsCollector<NetworkStats, si.Systeminformation.NetworkStatsData[]>
  | StatsCollector<DiskStats, si.Systeminformation.FsStatsData>
  | StatsCollector<DiskSizeStats, si.Systeminformation.FsSizeData[]>;

const statsCollectors: AnyStatsCollector[] = [...]
```

**影響範囲**:
- `src/features/stats/server.ts` - AnyStatsCollector型の追加、statsCollectors配列の型変更

### 2025-12-27 (2): logger.error()の単純化
- `logger.error()`をErrorオブジェクトのみを受け取るように変更
- オプションのコンテキストメッセージパラメータを追加
- 新しいシグネチャ：`error(error: Error, context?: string): void`
- すべてのエラーハンドラを新しいシグネチャに統一（19箇所）
- 2行のlogger.error呼び出しを1行に統合
- エラーメッセージの文字列補間をコンテキストパラメータに移行
- ビルドで検証済み（`npm run bundle`成功）

**影響範囲**:
- `src/utils/logger.ts` - error関数のシグネチャ変更
- `src/features/step/stepTracer.ts` - 3箇所
- `src/features/stats/collector.ts` - 3箇所
- `src/features/process/processTracer.ts` - 6箇所
- `src/entry/post.ts` - 3箇所（うち1箇所は非catch block）
- `src/features/stats/server.ts` - 2箇所
- `src/features/stats/chartGenerator.ts` - 1箇所
- `src/entry/main.ts` - 1箇所

### 2025-12-27 (1): 型安全性の向上（項目4）
- すべてのエラーハンドラで`catch (error: any)`を`catch (error: unknown)`に変更（22箇所）
- 適切な型ガード（`error instanceof Error`）を追加
- `logger.ts`の型チェックロジックを修正：
  - 不要な`instanceof String`チェックを削除
  - 型アサーションを削除
  - テンプレートリテラルに変更
  - 戻り値の型を明示的に`void`に指定
- ビルドで検証済み（`npm run bundle`成功）

**影響範囲**:
- `src/features/step/stepTracer.ts`
- `src/features/stats/collector.ts`
- `src/features/process/processTracer.ts`
- `src/entry/post.ts`
- `src/features/stats/server.ts`
- `src/features/stats/chartGenerator.ts`
- `src/entry/main.ts`
- `src/utils/logger.ts`

## 維持すべき良い点
- 優れたTypeScript strict mode設定
- 機能モジュールの適切な責務分離
- トレーサー間で一貫したライフサイクルパターン
- 明確なインターフェース定義とreadonly プロパティ
- 定数ファイルの適切な使用
