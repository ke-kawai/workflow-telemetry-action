/**
 * Application-wide configuration types
 */

export interface ProcessTracerConfig {
  minDuration: number;
  chartShow: boolean;
  chartMaxCount: number;
  tableShow: boolean;
}

export interface StatsCollectorConfig {
  metricFrequency: number;
}

export interface GitHubConfig {
  token: string;
}

export interface ReportConfig {
  jobSummary: boolean;
  commentOnPR: boolean;
}

/**
 * Main entry configuration
 */
export interface MainConfig {
  processTracer: ProcessTracerConfig;
  statsCollector: StatsCollectorConfig;
}

/**
 * Post entry configuration
 */
export interface PostConfig {
  github: GitHubConfig;
  report: ReportConfig;
  processTracer: ProcessTracerConfig;
  statsCollector: StatsCollectorConfig;
}
