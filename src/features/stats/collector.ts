import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs";
import * as core from "@actions/core";
import { WorkflowJobType } from "../../interfaces";
import {
  CPUStats,
  DiskSizeStats,
  DiskStats,
  LineGraphOptions,
  MemoryStats,
  NetworkStats,
  ProcessedCPUStats,
  ProcessedDiskSizeStats,
  ProcessedDiskStats,
  ProcessedMemoryStats,
  ProcessedNetworkStats,
  ProcessedStats,
  StackedAreaGraphOptions,
} from "./types";
import { Logger } from "../../utils/logger";
import { FILE_PATHS } from "../../constants";

const logger = new Logger();

const STATS_DATA_FILE = path.join(__dirname, "../", FILE_PATHS.STATS_DATA);

interface StatsData {
  cpu: CPUStats[];
  memory: MemoryStats[];
  network: NetworkStats[];
  disk: DiskStats[];
  diskSize: DiskSizeStats[];
}

function loadStatsData(): StatsData | null {
  try {
    if (fs.existsSync(STATS_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_DATA_FILE, "utf-8"));
      logger.debug("Loaded stats data from file");
      return data;
    }
    logger.debug("Stats data file does not exist");
    return null;
  } catch (error: unknown) {
    logger.error(error, "Error loading stats data");
    return null;
  }
}

interface AllStats {
  cpu: ProcessedCPUStats;
  memory: ProcessedMemoryStats;
  network: ProcessedNetworkStats;
  disk: ProcessedDiskStats;
  diskSize: ProcessedDiskSizeStats;
}

interface MetricCharts {
  cpuLoad: string | null;
  memoryUsage: string | null;
  networkIORead: string | null;
  networkIOWrite: string | null;
  diskIORead: string | null;
  diskIOWrite: string | null;
  diskSizeUsage: string | null;
}

async function fetchAllStats(): Promise<AllStats> {
  const cpu = await getCPUStats();
  const memory = await getMemoryStats();
  const network = await getNetworkStats();
  const disk = await getDiskStats();
  const diskSize = await getDiskSizeStats();

  return { cpu, memory, network, disk, diskSize };
}

async function createMetricCharts(stats: AllStats): Promise<MetricCharts> {
  const { userLoadX, systemLoadX } = stats.cpu;
  const { activeMemoryX, availableMemoryX } = stats.memory;
  const { networkReadX, networkWriteX } = stats.network;
  const { diskReadX, diskWriteX } = stats.disk;
  const { diskAvailableX, diskUsedX } = stats.diskSize;

  const cpuLoad =
    userLoadX && userLoadX.length && systemLoadX && systemLoadX.length
      ? await getStackedAreaGraph({
          label: "CPU Load (%)",
          areas: [
            {
              label: "User Load",
              color: "#e41a1c99",
              points: userLoadX,
            },
            {
              label: "System Load",
              color: "#ff7f0099",
              points: systemLoadX,
            },
          ],
        })
      : null;

  const memoryUsage =
    activeMemoryX &&
    activeMemoryX.length &&
    availableMemoryX &&
    availableMemoryX.length
      ? await getStackedAreaGraph({
          label: "Memory Usage (MB)",
          areas: [
            {
              label: "Used",
              color: "#377eb899",
              points: activeMemoryX,
            },
            {
              label: "Free",
              color: "#4daf4a99",
              points: availableMemoryX,
            },
          ],
        })
      : null;

  const networkIORead =
    networkReadX && networkReadX.length
      ? await getLineGraph({
          label: "Network I/O Read (MB)",
          line: {
            label: "Read",
            color: "#be4d25",
            points: networkReadX,
          },
        })
      : null;

  const networkIOWrite =
    networkWriteX && networkWriteX.length
      ? await getLineGraph({
          label: "Network I/O Write (MB)",
          line: {
            label: "Write",
            color: "#6c25be",
            points: networkWriteX,
          },
        })
      : null;

  const diskIORead =
    diskReadX && diskReadX.length
      ? await getLineGraph({
          label: "Disk I/O Read (MB)",
          line: {
            label: "Read",
            color: "#be4d25",
            points: diskReadX,
          },
        })
      : null;

  const diskIOWrite =
    diskWriteX && diskWriteX.length
      ? await getLineGraph({
          label: "Disk I/O Write (MB)",
          line: {
            label: "Write",
            color: "#6c25be",
            points: diskWriteX,
          },
        })
      : null;

  const diskSizeUsage =
    diskUsedX && diskUsedX.length && diskAvailableX && diskAvailableX.length
      ? await getStackedAreaGraph({
          label: "Disk Usage (MB)",
          areas: [
            {
              label: "Used",
              color: "#377eb899",
              points: diskUsedX,
            },
            {
              label: "Free",
              color: "#4daf4a99",
              points: diskAvailableX,
            },
          ],
        })
      : null;

  return {
    cpuLoad,
    memoryUsage,
    networkIORead,
    networkIOWrite,
    diskIORead,
    diskIOWrite,
    diskSizeUsage,
  };
}

function formatMetricsReport(charts: MetricCharts): string {
  const postContentItems: string[] = [];

  if (charts.cpuLoad) {
    postContentItems.push("### CPU Metrics", charts.cpuLoad, "");
  }
  if (charts.memoryUsage) {
    postContentItems.push("### Memory Metrics", charts.memoryUsage, "");
  }
  if (
    (charts.networkIORead && charts.networkIOWrite) ||
    (charts.diskIORead && charts.diskIOWrite)
  ) {
    postContentItems.push(
      "### IO Metrics",
      "|               | Read      | Write     |",
      "|---            |---        |---        |"
    );
  }
  if (charts.networkIORead && charts.networkIOWrite) {
    postContentItems.push(
      `| Network I/O   | ${charts.networkIORead}        | ${charts.networkIOWrite}        |`
    );
  }
  if (charts.diskIORead && charts.diskIOWrite) {
    postContentItems.push(
      `| Disk I/O      | ${charts.diskIORead}              | ${charts.diskIOWrite}              |`
    );
  }
  if (charts.diskSizeUsage) {
    postContentItems.push("### Disk Size Metrics", charts.diskSizeUsage, "");
  }

  return postContentItems.join("\n");
}

function normalizeValue(value: number | undefined): number {
  return value && value > 0 ? value : 0;
}

async function reportWorkflowMetrics(): Promise<string> {
  const stats = await fetchAllStats();
  const charts = await createMetricCharts(stats);
  return formatMetricsReport(charts);
}

async function getCPUStats(): Promise<ProcessedCPUStats> {
  const userLoadX: ProcessedStats[] = [];
  const systemLoadX: ProcessedStats[] = [];

  const statsData = loadStatsData();
  const data = statsData?.cpu || [];

  data.forEach((element: CPUStats) => {
    userLoadX.push({
      x: element.time,
      y: normalizeValue(element.userLoad),
    });

    systemLoadX.push({
      x: element.time,
      y: normalizeValue(element.systemLoad),
    });
  });

  return { userLoadX, systemLoadX };
}

async function getMemoryStats(): Promise<ProcessedMemoryStats> {
  const activeMemoryX: ProcessedStats[] = [];
  const availableMemoryX: ProcessedStats[] = [];

  const statsData = loadStatsData();
  const data = statsData?.memory || [];

  data.forEach((element: MemoryStats) => {
    activeMemoryX.push({
      x: element.time,
      y: normalizeValue(element.activeMemoryMb),
    });

    availableMemoryX.push({
      x: element.time,
      y: normalizeValue(element.availableMemoryMb),
    });
  });

  return { activeMemoryX, availableMemoryX };
}

async function getNetworkStats(): Promise<ProcessedNetworkStats> {
  const networkReadX: ProcessedStats[] = [];
  const networkWriteX: ProcessedStats[] = [];

  const statsData = loadStatsData();
  const data = statsData?.network || [];

  data.forEach((element: NetworkStats) => {
    networkReadX.push({
      x: element.time,
      y: normalizeValue(element.rxMb),
    });

    networkWriteX.push({
      x: element.time,
      y: normalizeValue(element.txMb),
    });
  });

  return { networkReadX, networkWriteX };
}

async function getDiskStats(): Promise<ProcessedDiskStats> {
  const diskReadX: ProcessedStats[] = [];
  const diskWriteX: ProcessedStats[] = [];

  const statsData = loadStatsData();
  const data = statsData?.disk || [];

  data.forEach((element: DiskStats) => {
    diskReadX.push({
      x: element.time,
      y: normalizeValue(element.rxMb),
    });

    diskWriteX.push({
      x: element.time,
      y: normalizeValue(element.wxMb),
    });
  });

  return { diskReadX, diskWriteX };
}

async function getDiskSizeStats(): Promise<ProcessedDiskSizeStats> {
  const diskAvailableX: ProcessedStats[] = [];
  const diskUsedX: ProcessedStats[] = [];

  const statsData = loadStatsData();
  const data = statsData?.diskSize || [];

  data.forEach((element: DiskSizeStats) => {
    diskAvailableX.push({
      x: element.time,
      y: normalizeValue(element.availableSizeMb),
    });

    diskUsedX.push({
      x: element.time,
      y: normalizeValue(element.usedSizeMb),
    });
  });

  return { diskAvailableX, diskUsedX };
}

async function getLineGraph(options: LineGraphOptions): Promise<string> {
  // Import chartGenerator functions dynamically
  const chartGenerator = await import("./chartGenerator");
  return chartGenerator.getLineGraph(options);
}

async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<string> {
  // Import chartGenerator functions dynamically
  const chartGenerator = await import("./chartGenerator");
  return chartGenerator.getStackedAreaGraph(options);
}

export async function start(): Promise<boolean> {
  logger.info(`Starting stat collector ...`);

  try {
    let metricFrequency = 0;
    const metricFrequencyInput: string = core.getInput("metric_frequency");
    if (metricFrequencyInput) {
      const metricFrequencyVal: number = parseInt(metricFrequencyInput);
      if (Number.isInteger(metricFrequencyVal)) {
        metricFrequency = metricFrequencyVal * 1000;
      }
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (metricFrequency) {
      env.WORKFLOW_TELEMETRY_STAT_FREQ = `${metricFrequency}`;
    }

    const child: ChildProcess = spawn(
      process.execPath,
      [path.join(__dirname, "../scw/index.js")],
      {
        detached: true,
        stdio: "ignore",
        env,
      }
    );
    child.unref();

    logger.info(`Started stat collector`);

    return true;
  } catch (error: unknown) {
    logger.error(error, "Unable to start stat collector");

    return false;
  }
}

export async function finish(_currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing stat collector ...`);

  try {
    // Note: No action needed for finish. The background collector
    // automatically saves stats to file periodically.

    logger.info(`Finished stat collector`);

    return true;
  } catch (error: unknown) {
    logger.error(error, "Unable to finish stat collector");

    return false;
  }
}

export async function report(
  _currentJob: WorkflowJobType
): Promise<string | null> {
  logger.info(`Reporting stat collector result ...`);

  try {
    const postContent: string = await reportWorkflowMetrics();

    logger.info(`Reported stat collector result`);

    return postContent;
  } catch (error: unknown) {
    logger.error(error, "Unable to report stat collector result");

    return null;
  }
}
