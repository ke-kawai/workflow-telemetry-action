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

interface StatsTransformConfig<T> {
  endpoint: string;
  fields: {
    first: (data: T) => number | undefined;
    second: (data: T) => number | undefined;
  };
}

async function transformStats<T extends { time: number }>(
  config: StatsTransformConfig<T>
): Promise<[ProcessedStats[], ProcessedStats[]]> {
  const firstArray: ProcessedStats[] = [];
  const secondArray: ProcessedStats[] = [];

  const data = await fetchStats<T>(config.endpoint);

  data.forEach((element: T) => {
    const firstValue = config.fields.first(element);
    firstArray.push({
      x: element.time,
      y: firstValue && firstValue > 0 ? firstValue : 0,
    });

    const secondValue = config.fields.second(element);
    secondArray.push({
      x: element.time,
      y: secondValue && secondValue > 0 ? secondValue : 0,
    });
  });

  return [firstArray, secondArray];
}

async function getCPUStats(): Promise<ProcessedCPUStats> {
  const [userLoadX, systemLoadX] = await transformStats<CPUStats>({
    endpoint: "cpu",
    fields: {
      first: (data) => data.userLoad,
      second: (data) => data.systemLoad,
    },
  });

  return { userLoadX, systemLoadX };
}

async function getMemoryStats(): Promise<ProcessedMemoryStats> {
  const [activeMemoryX, availableMemoryX] = await transformStats<MemoryStats>({
    endpoint: "memory",
    fields: {
      first: (data) => data.activeMemoryMb,
      second: (data) => data.availableMemoryMb,
    },
  });

  return { activeMemoryX, availableMemoryX };
}

async function getNetworkStats(): Promise<ProcessedNetworkStats> {
  const [networkReadX, networkWriteX] = await transformStats<NetworkStats>({
    endpoint: "network",
    fields: {
      first: (data) => data.rxMb,
      second: (data) => data.txMb,
    },
  });

  return { networkReadX, networkWriteX };
}

async function getDiskStats(): Promise<ProcessedDiskStats> {
  const [diskReadX, diskWriteX] = await transformStats<DiskStats>({
    endpoint: "disk",
    fields: {
      first: (data) => data.rxMb,
      second: (data) => data.wxMb,
    },
  });

  return { diskReadX, diskWriteX };
}

async function getDiskSizeStats(): Promise<ProcessedDiskSizeStats> {
  const [diskAvailableX, diskUsedX] = await transformStats<DiskSizeStats>({
    endpoint: "disk_size",
    fields: {
      first: (data) => data.availableSizeMb,
      second: (data) => data.usedSizeMb,
    },
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
