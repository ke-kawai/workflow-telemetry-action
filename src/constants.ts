/**
 * HTTP Server Configuration
 */
export const SERVER = {
  /** HTTP server host (localhost only for security) */
  HOST: "localhost",
  /** HTTP server port for stats collection */
  PORT: 7777,
} as const;

/**
 * Stats Collection Configuration
 */
export const STATS_COLLECTION = {
  /** Default stats collection frequency in milliseconds */
  DEFAULT_FREQUENCY_MS: 5000,
  /** HTTP request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 5000,
} as const;

/**
 * Process Tracing Configuration
 */
export const PROCESS_TRACE = {
  /** Process collection interval in milliseconds */
  COLLECTION_INTERVAL_MS: 1000,
  /** Default maximum number of processes to show in chart */
  DEFAULT_CHART_MAX_COUNT: 100,
  /** GitHub Actions file path prefix (Linux/Ubuntu specific) */
  GHA_FILE_PREFIX: "/home/runner/work/_actions/",
} as const;

/**
 * GitHub API Configuration
 */
export const GITHUB_API = {
  /** Number of items per page for pagination */
  PAGE_SIZE: 100,
  /** Maximum number of retries for getting current job */
  CURRENT_JOB_RETRY_COUNT: 10,
  /** Retry interval in milliseconds */
  CURRENT_JOB_RETRY_INTERVAL_MS: 1000,
} as const;

/**
 * QuickChart Configuration
 */
export const QUICKCHART = {
  /** QuickChart.io API endpoint */
  API_URL: "https://quickchart.io/chart/create",
  /** Chart width in pixels */
  CHART_WIDTH: 800,
  /** Chart height in pixels */
  CHART_HEIGHT: 400,
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 10000,
} as const;

/**
 * Theme Configuration
 */
export const THEME = {
  COLORS: {
    BLACK: "#000000",
    WHITE: "#FFFFFF",
  },
  LIGHT: {
    AXIS_COLOR: "#000000",
    BACKGROUND_COLOR: "white",
  },
  DARK: {
    AXIS_COLOR: "#FFFFFF",
    BACKGROUND_COLOR: "#0d1117",
  },
} as const;

/**
 * File Paths
 */
export const FILE_PATHS = {
  /** Process tracer state file */
  PROC_TRACER_STATE: ".proc-tracer-started",
  /** Process tracer data file */
  PROC_TRACER_DATA: "proc-tracer-data.json",
  /** Stats collector data file */
  STATS_DATA: "stats-data.json",
} as const;
