import { ChildProcess, spawn } from "child_process";
import path from "path";
import * as core from "@actions/core";
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
  WorkflowJobType,
} from "../../interfaces";
import * as logger from "../../utils/logger";
import { SERVER } from "../../constants";

async function fetchStats<T>(endpoint: string): Promise<T[]> {
  logger.debug(`Getting ${endpoint} stats ...`);
  const response = await fetch(`http://localhost:${SERVER.PORT}/${endpoint}`);
  const data = await response.json();
  if (logger.isDebugEnabled()) {
    logger.debug(`Got ${endpoint} stats: ${JSON.stringify(data)}`);
  }
  return data;
}

async function triggerStatCollect(): Promise<void> {
  logger.debug("Triggering stat collect ...");
  const response = await fetch(`http://localhost:${SERVER.PORT}/collect`, {
    method: "POST",
  });
  if (logger.isDebugEnabled()) {
    const text = await response.text();
    if (text) {
      const data = JSON.parse(text);
      logger.debug(`Triggered stat collect: ${JSON.stringify(data)}`);
    } else {
      logger.debug("Triggered stat collect: no response body");
    }
  }
}

async function reportWorkflowMetrics(): Promise<string> {
  const { userLoadX, systemLoadX } = await getCPUStats();
  const { activeMemoryX, availableMemoryX } = await getMemoryStats();
  const { networkReadX, networkWriteX } = await getNetworkStats();
  const { diskReadX, diskWriteX } = await getDiskStats();
  const { diskAvailableX, diskUsedX } = await getDiskSizeStats();

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

  const postContentItems: string[] = [];
  if (cpuLoad) {
    postContentItems.push("### CPU Metrics", cpuLoad, "");
  }
  if (memoryUsage) {
    postContentItems.push("### Memory Metrics", memoryUsage, "");
  }
  if ((networkIORead && networkIOWrite) || (diskIORead && diskIOWrite)) {
    postContentItems.push(
      "### IO Metrics",
      "|               | Read      | Write     |",
      "|---            |---        |---        |"
    );
  }
  if (networkIORead && networkIOWrite) {
    postContentItems.push(
      `| Network I/O   | ${networkIORead}        | ${networkIOWrite}        |`
    );
  }
  if (diskIORead && diskIOWrite) {
    postContentItems.push(
      `| Disk I/O      | ${diskIORead}              | ${diskIOWrite}              |`
    );
  }
  if (diskSizeUsage) {
    postContentItems.push("### Disk Size Metrics", diskSizeUsage, "");
  }

  return postContentItems.join("\n");
}

async function getCPUStats(): Promise<ProcessedCPUStats> {
  const userLoadX: ProcessedStats[] = [];
  const systemLoadX: ProcessedStats[] = [];

  const data = await fetchStats<CPUStats>("cpu");

  data.forEach((element: CPUStats) => {
    userLoadX.push({
      x: element.time,
      y: element.userLoad && element.userLoad > 0 ? element.userLoad : 0,
    });

    systemLoadX.push({
      x: element.time,
      y: element.systemLoad && element.systemLoad > 0 ? element.systemLoad : 0,
    });
  });

  return { userLoadX, systemLoadX };
}

async function getMemoryStats(): Promise<ProcessedMemoryStats> {
  const activeMemoryX: ProcessedStats[] = [];
  const availableMemoryX: ProcessedStats[] = [];

  const data = await fetchStats<MemoryStats>("memory");

  data.forEach((element: MemoryStats) => {
    activeMemoryX.push({
      x: element.time,
      y:
        element.activeMemoryMb && element.activeMemoryMb > 0
          ? element.activeMemoryMb
          : 0,
    });

    availableMemoryX.push({
      x: element.time,
      y:
        element.availableMemoryMb && element.availableMemoryMb > 0
          ? element.availableMemoryMb
          : 0,
    });
  });

  return { activeMemoryX, availableMemoryX };
}

async function getNetworkStats(): Promise<ProcessedNetworkStats> {
  const networkReadX: ProcessedStats[] = [];
  const networkWriteX: ProcessedStats[] = [];

  const data = await fetchStats<NetworkStats>("network");

  data.forEach((element: NetworkStats) => {
    networkReadX.push({
      x: element.time,
      y: element.rxMb && element.rxMb > 0 ? element.rxMb : 0,
    });

    networkWriteX.push({
      x: element.time,
      y: element.txMb && element.txMb > 0 ? element.txMb : 0,
    });
  });

  return { networkReadX, networkWriteX };
}

async function getDiskStats(): Promise<ProcessedDiskStats> {
  const diskReadX: ProcessedStats[] = [];
  const diskWriteX: ProcessedStats[] = [];

  const data = await fetchStats<DiskStats>("disk");

  data.forEach((element: DiskStats) => {
    diskReadX.push({
      x: element.time,
      y: element.rxMb && element.rxMb > 0 ? element.rxMb : 0,
    });

    diskWriteX.push({
      x: element.time,
      y: element.wxMb && element.wxMb > 0 ? element.wxMb : 0,
    });
  });

  return { diskReadX, diskWriteX };
}

async function getDiskSizeStats(): Promise<ProcessedDiskSizeStats> {
  const diskAvailableX: ProcessedStats[] = [];
  const diskUsedX: ProcessedStats[] = [];

  const data = await fetchStats<DiskSizeStats>("disk_size");

  data.forEach((element: DiskSizeStats) => {
    diskAvailableX.push({
      x: element.time,
      y:
        element.availableSizeMb && element.availableSizeMb > 0
          ? element.availableSizeMb
          : 0,
    });

    diskUsedX.push({
      x: element.time,
      y: element.usedSizeMb && element.usedSizeMb > 0 ? element.usedSizeMb : 0,
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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to start stat collector");

    return false;
  }
}

export async function finish(_currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing stat collector ...`);

  try {
    // Trigger stat collect, so we will have remaining stats since the latest schedule
    await triggerStatCollect();

    logger.info(`Finished stat collector`);

    return true;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to finish stat collector");

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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to report stat collector result");

    return null;
  }
}
