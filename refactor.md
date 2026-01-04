# リファクタリング提案

## 🔴 高優先度の改善

### 1. カラーコードの定数化

**ファイル**: `src/features/stats/collector.ts` (93-189 行)

**問題点**:

- 同じカラーコードが複数回ハードコーディング
  - `#be4d25` (Read) - 2 回
  - `#6c25be` (Write) - 2 回
  - `#377eb899` (Used) - 2 回
  - `#4daf4a99` (Free) - 2 回
- 色の変更時に複数箇所を修正する必要がある
- 一貫性が保証されない

**提案**:

```typescript
const CHART_COLORS = {
  CPU_USER: "#e41a1c99",
  CPU_SYSTEM: "#ff7f0099",
  MEMORY_USED: "#377eb899",
  MEMORY_FREE: "#4daf4a99",
  IO_READ: "#be4d25",
  IO_WRITE: "#6c25be",
} as const;
```

**効果**:

- メンテナンス性向上（一箇所で色を管理）
- 色の一貫性保証
- 意味のある名前で可読性向上

---

### 2. 不要な動的インポートの削除

**ファイル**: `src/features/stats/collector.ts` (361-373 行)

**問題点**:

- 不要なラッパー関数が 2 つ存在
- 動的インポートの利点がない（常に同じモジュールをインポート）
- コードの複雑性が増している

**Before**:

```typescript
async function getLineGraph(options: LineGraphOptions): Promise<string> {
  const chartGenerator = await import("./chartGenerator");
  return chartGenerator.getLineGraph(options);
}

async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<string> {
  const chartGenerator = await import("./chartGenerator");
  return chartGenerator.getStackedAreaGraph(options);
}
```

**After**:

```typescript
import { getLineGraph, getStackedAreaGraph } from "./chartGenerator";
```

**効果**:

- コード簡潔化（ラッパー関数削除）
- パフォーマンス向上（動的ロードのオーバーヘッド削減）
- 可読性向上

---

### 3. any 型の削除

**ファイル**: `src/features/stats/chartGenerator.ts:108`

**問題点**:

- `chartConfig: any` で型安全性が失われている
- コンパイル時のエラー検出ができない

**提案**:

```typescript
interface ChartJSDataset {
  label: string;
  data: any[];
  borderColor?: string;
  backgroundColor?: string;
  fill?: boolean | string;
  tension?: number;
}

interface ChartJSConfig {
  type: string;
  data: {
    datasets: ChartJSDataset[];
  };
  options: {
    scales: {
      xAxes?: any[];
      yAxes?: any[];
    };
    legend: {
      labels: {
        fontColor: string;
      };
    };
  };
}

async function createChartFromConfig(
  theme: Theme,
  config: ThemeConfig,
  chartConfig: ChartJSConfig,
  errorLabel: string
): Promise<string | null>;
```

**効果**:

- 型安全性向上
- IDE 補完の改善
- バグの早期発見

---

## 🟡 中優先度の改善

### 4. 文字列連結の改善

**影響範囲**: ChartGenerator クラス全般（142 箇所）

**問題点**:

- `.concat()` の繰り返し使用で可読性が低い
- パフォーマンスの問題（多数の文字列結合）

**Before**:

```typescript
header = header.concat("gantt", "\n");
header = header.concat("\t", `title ${jobName}`, "\n");
header = header.concat("\t", `dateFormat x`, "\n");
header = header.concat("\t", `axisFormat %H:%M:%S`, "\n");
```

**After**:

```typescript
const lines = [
  "gantt",
  `\ttitle ${jobName}`,
  `\tdateFormat x`,
  `\taxisFormat %H:%M:%S`,
];
return lines.join("\n") + "\n";
```

**効果**:

- 可読性の大幅向上
- パフォーマンス向上（単一の join 操作）
- メンテナンス容易性向上

---

### 5. テーブルカラム幅の定数化

**ファイル**: `src/features/process/processTableGenerator.ts:19-25`

**問題点**:

- マジックナンバー (16, 7, 15, 10, 40) がハードコーディング
- カラム幅の変更時に複数箇所を修正する必要がある

**提案**:

```typescript
const COLUMN_WIDTHS = {
  NAME: 16,
  PID: 7,
  START_TIME: 15,
  DURATION: 15,
  MAX_CPU: 10,
  MAX_MEM: 10,
  COMMAND: 40,
} as const;

private formatRow(
  name: string | number,
  pid: string | number,
  startTime: string | number,
  duration: string | number,
  maxCpu: string | number,
  maxMem: string | number,
  commandParams: string
): string {
  return `${padEnd(name, COLUMN_WIDTHS.NAME)} ${padStart(pid, COLUMN_WIDTHS.PID)} ${padStart(
    startTime,
    COLUMN_WIDTHS.START_TIME
  )} ...`;
}
```

**効果**:

- マジックナンバー排除
- 保守性向上（一箇所で管理）
- 自己文書化

---

## 🟢 低優先度の改善

### 6. createMetricCharts 関数の重複パターン削除

**ファイル**: `src/features/stats/collector.ts:86-193`

**問題点**:

- 似たようなチャート生成コードが 7 回繰り返される
- cpuLoad, memoryUsage, networkIORead, networkIOWrite, diskIORead, diskIOWrite, diskSizeUsage

**提案**:
ヘルパー関数を作成して重複を削減：

```typescript
async function createLineChartIfData(
  data: ProcessedStats[] | undefined,
  label: string,
  lineLabel: string,
  color: string
): Promise<string | null> {
  return data && data.length
    ? await getLineGraph({
        label,
        line: { label: lineLabel, color, points: data },
      })
    : null;ddd
}

async function createStackedAreaChartIfData(
  data1: ProcessedStats[] | undefined,
  data2: ProcessedStats[] | undefined,
  label: string,
  area1Label: string,
  area1Color: string,
  area2Label: string,
  area2Color: string
): Promise<string | null> {
  return data1 && data1.length && data2 && data2.length
    ? await getStackedAreaGraph({
        label,
        areas: [
          { label: area1Label, color: area1Color, points: data1 },
          { label: area2Label, color: area2Color, points: data2 },
        ],
      })
    : null;
}
```

**効果**:

- コード重複の削減
- 保守性向上
- DRY 原則の適用

---

### 7. 入力バリデーションの追加

**影響範囲**: 各種設定パース箇所

**問題点**:

- ユーザー入力の検証が不十分
- 負の数や範囲外の値のチェックがない

**例** (`src/features/stats/collector.ts`):

```typescript
const metricFrequencyVal: number = parseInt(metricFrequencyInput);
if (Number.isInteger(metricFrequencyVal)) {
  metricFrequency = metricFrequencyVal * 1000;
}
```

**提案**:

```typescript
const metricFrequencyVal: number = parseInt(metricFrequencyInput);
if (
  Number.isInteger(metricFrequencyVal) &&
  metricFrequencyVal > 0 &&
  metricFrequencyVal <= 3600
) {
  metricFrequency = metricFrequencyVal * 1000;
} else {
  logger.warn(
    `Invalid metric_frequency: ${metricFrequencyInput}, using default`
  );
  metricFrequency = DEFAULT_FREQUENCY;
}
```

**効果**:

- 予期しない動作の防止
- ユーザーへの適切なフィードバック

---

## 📋 その他の懸念事項

### テストの欠如

- `package.json`: `"test": "echo \"Warn: no test specified\" && exit 0"`
- テストカバレッジがゼロ
- リファクタリングの安全性が保証されない

### 外部 API 依存

- QuickChart API に依存
- サービスダウン時のフォールバックなし
- エラー時の適切なハンドリングが必要

---

## ✅ 維持すべき良い点

- 優れた TypeScript strict mode 設定
- 機能モジュールの適切な責務分離
- トレーサー間で一貫したライフサイクルパターン
- 明確なインターフェース定義と readonly プロパティ
- 定数ファイルの適切な使用
- クラスベースの設計と DI（依存性注入）
- エラーハンドリングの一貫性

### リファクタリング計画

- constants.ts をそれぞれの必要な箇所へ移動
  - 共通のものとかほぼないはず
- colors を定数化
  - 色の名前でつけてあげる
  - これは constants.ts に入れてもいいかも
- generateStepLine を改良
  - 最後に謎の join("")してるのをやめる
  - 代わりに generateStepLine を map 関数で呼び出しているやつがいるのでその後で join("\n")にする
- formatRow の見た目を改善
  - 不自然な改行でわかりづらい
- configLoader.ts の 