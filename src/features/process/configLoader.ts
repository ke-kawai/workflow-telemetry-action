import * as core from "@actions/core";
import { ProcessTracerConfig } from "./types";

const DEFAULT_PROC_TRACE_CHART_MAX_COUNT = 100;

export function loadProcessTracerConfig(): ProcessTracerConfig {
  let minDuration = -1;
  const procTraceMinDurationInput: string = core.getInput(
    "proc_trace_min_duration",
  );
  if (procTraceMinDurationInput) {
    const minProcDurationVal: number = parseInt(procTraceMinDurationInput);
    if (Number.isInteger(minProcDurationVal)) {
      minDuration = minProcDurationVal;
    }
  }
  const chartShow: boolean = core.getInput("proc_trace_chart_show") === "true";
  const procTraceChartMaxCountInput: number = parseInt(
    core.getInput("proc_trace_chart_max_count"),
  );
  const chartMaxCount = Number.isInteger(procTraceChartMaxCountInput)
    ? procTraceChartMaxCountInput
    : DEFAULT_PROC_TRACE_CHART_MAX_COUNT;
  const tableShow: boolean = core.getInput("proc_trace_table_show") === "true";

  return { minDuration, chartShow, chartMaxCount, tableShow };
}
