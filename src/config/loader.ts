import * as core from "@actions/core";
import { MainConfig, PostConfig } from "./types";

/**
 * Load configuration for main entry point
 */
export function loadMainConfig(): MainConfig {
  return {
    processTracer: {
      minDuration: parseInt(core.getInput("proc_trace_min_duration")),
      chartShow: core.getInput("proc_trace_chart_show") === "true",
      chartMaxCount: parseInt(core.getInput("proc_trace_chart_max_count")),
      tableShow: core.getInput("proc_trace_table_show") === "true",
    },
    statsCollector: {
      metricFrequency: parseInt(core.getInput("metric_frequency")) * 1000,
    },
  };
}

/**
 * Load configuration for post entry point
 */
export function loadPostConfig(): PostConfig {
  return {
    github: {
      token: core.getInput("github_token"),
    },
    report: {
      jobSummary: core.getInput("job_summary") === "true",
      commentOnPR: core.getInput("comment_on_pr") === "true",
    },
    processTracer: {
      minDuration: parseInt(core.getInput("proc_trace_min_duration")),
      chartShow: core.getInput("proc_trace_chart_show") === "true",
      chartMaxCount: parseInt(core.getInput("proc_trace_chart_max_count")),
      tableShow: core.getInput("proc_trace_table_show") === "true",
    },
    statsCollector: {
      metricFrequency: parseInt(core.getInput("metric_frequency")) * 1000,
    },
  };
}
