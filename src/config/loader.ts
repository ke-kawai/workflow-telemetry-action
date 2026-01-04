import * as core from "@actions/core";
import { MainConfig, PostConfig } from "./types";

/**
 * Load configuration for main entry point
 */
export function loadMainConfig(): MainConfig {
  // Process Tracer Configuration
  let minDuration = -1;
  const procTraceMinDurationInput = core.getInput("proc_trace_min_duration");
  if (procTraceMinDurationInput) {
    const minProcDurationVal = parseInt(procTraceMinDurationInput);
    if (Number.isInteger(minProcDurationVal)) {
      minDuration = minProcDurationVal;
    }
  }

  const chartShow = core.getInput("proc_trace_chart_show") === "true";
  const procTraceChartMaxCountInput = parseInt(
    core.getInput("proc_trace_chart_max_count")
  );
  const chartMaxCount = Number.isInteger(procTraceChartMaxCountInput)
    ? procTraceChartMaxCountInput
    : 100;
  const tableShow = core.getInput("proc_trace_table_show") === "true";

  // Stats Collector Configuration
  let metricFrequency = 0;
  const metricFrequencyInput = core.getInput("metric_frequency");
  if (metricFrequencyInput) {
    const metricFrequencyVal = parseInt(metricFrequencyInput);
    if (Number.isInteger(metricFrequencyVal)) {
      metricFrequency = metricFrequencyVal * 1000;
    }
  }

  return {
    processTracer: {
      minDuration,
      chartShow,
      chartMaxCount,
      tableShow,
    },
    statsCollector: {
      metricFrequency,
    },
  };
}

/**
 * Load configuration for post entry point
 */
export function loadPostConfig(): PostConfig {
  const token = core.getInput("github_token");
  const jobSummary = core.getInput("job_summary") === "true";
  const commentOnPR = core.getInput("comment_on_pr") === "true";

  return {
    github: {
      token,
    },
    report: {
      jobSummary,
      commentOnPR,
    },
  };
}
