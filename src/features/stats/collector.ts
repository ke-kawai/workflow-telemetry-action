import { ChildProcess, spawn } from "child_process";
import path from "path";
import { WorkflowJobType } from "../../interfaces";
import {
  ProcessedCPUStats,
  ProcessedDiskSizeStats,
  ProcessedDiskStats,
  ProcessedMemoryStats,
  ProcessedNetworkStats,
  ProcessedStats,
} from "./types";
import { Logger } from "../../utils/logger";
import { StatsChartGenerator } from "./chartGenerator";
import { StatsCollectorConfig } from "../../config/types";
import { StatsDataRepository, StatsData } from "./dataRepository";
import { MetricCharts, StatsReportFormatter } from "./reportFormatter";

interface AllStats {
  cpu: ProcessedCPUStats;
  memory: ProcessedMemoryStats;
  network: ProcessedNetworkStats;
  disk: ProcessedDiskStats;
  diskSize: ProcessedDiskSizeStats;
}

class StatsCollector {
  constructor(
    private logger: Logger,
    private chartGenerator: StatsChartGenerator,
    private reportFormatter: StatsReportFormatter,
    private dataRepository: StatsDataRepository
  ) { }

  private normalizeValue(value: number | undefined): number {
    return value && value > 0 ? value : 0;
  }

  private async getCPUStats(statsData: StatsData | null): Promise<ProcessedCPUStats> {
    const userLoadX: ProcessedStats[] = [];
    const systemLoadX: ProcessedStats[] = [];

    const data = statsData?.cpu || [];

    data.forEach((element) => {
      userLoadX.push({
        x: element.time,
        y: this.normalizeValue(element.userLoad),
      });

      systemLoadX.push({
        x: element.time,
        y: this.normalizeValue(element.systemLoad),
      });
    });

    return { userLoadX, systemLoadX };
  }

  private async getMemoryStats(statsData: StatsData | null): Promise<ProcessedMemoryStats> {
    const activeMemoryX: ProcessedStats[] = [];
    const availableMemoryX: ProcessedStats[] = [];

    const data = statsData?.memory || [];

    data.forEach((element) => {
      activeMemoryX.push({
        x: element.time,
        y: this.normalizeValue(element.activeMemoryMb),
      });

      availableMemoryX.push({
        x: element.time,
        y: this.normalizeValue(element.availableMemoryMb),
      });
    });

    return { activeMemoryX, availableMemoryX };
  }

  private async getNetworkStats(statsData: StatsData | null): Promise<ProcessedNetworkStats> {
    const networkReadX: ProcessedStats[] = [];
    const networkWriteX: ProcessedStats[] = [];

    const data = statsData?.network || [];

    data.forEach((element) => {
      networkReadX.push({
        x: element.time,
        y: this.normalizeValue(element.rxMb),
      });

      networkWriteX.push({
        x: element.time,
        y: this.normalizeValue(element.txMb),
      });
    });

    return { networkReadX, networkWriteX };
  }

  private async getDiskStats(statsData: StatsData | null): Promise<ProcessedDiskStats> {
    const diskReadX: ProcessedStats[] = [];
    const diskWriteX: ProcessedStats[] = [];

    const data = statsData?.disk || [];

    data.forEach((element) => {
      diskReadX.push({
        x: element.time,
        y: this.normalizeValue(element.rxMb),
      });

      diskWriteX.push({
        x: element.time,
        y: this.normalizeValue(element.wxMb),
      });
    });

    return { diskReadX, diskWriteX };
  }

  private async getDiskSizeStats(statsData: StatsData | null): Promise<ProcessedDiskSizeStats> {
    const diskAvailableX: ProcessedStats[] = [];
    const diskUsedX: ProcessedStats[] = [];

    const data = statsData?.diskSize || [];

    data.forEach((element) => {
      diskAvailableX.push({
        x: element.time,
        y: this.normalizeValue(element.availableSizeMb),
      });

      diskUsedX.push({
        x: element.time,
        y: this.normalizeValue(element.usedSizeMb),
      });
    });

    return { diskAvailableX, diskUsedX };
  }

  private async fetchAllStats(statsData: StatsData | null): Promise<AllStats> {
    const cpu = await this.getCPUStats(statsData);
    const memory = await this.getMemoryStats(statsData);
    const network = await this.getNetworkStats(statsData);
    const disk = await this.getDiskStats(statsData);
    const diskSize = await this.getDiskSizeStats(statsData);

    return { cpu, memory, network, disk, diskSize };
  }

  private async createMetricCharts(stats: AllStats): Promise<MetricCharts> {
    const { userLoadX, systemLoadX } = stats.cpu;
    const { activeMemoryX, availableMemoryX } = stats.memory;
    const { networkReadX, networkWriteX } = stats.network;
    const { diskReadX, diskWriteX } = stats.disk;
    const { diskAvailableX, diskUsedX } = stats.diskSize;

    const cpuLoad =
      userLoadX && userLoadX.length && systemLoadX && systemLoadX.length
        ? await this.chartGenerator.getStackedAreaGraph({
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
        ? await this.chartGenerator.getStackedAreaGraph({
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
        ? await this.chartGenerator.getLineGraph({
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
        ? await this.chartGenerator.getLineGraph({
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
        ? await this.chartGenerator.getLineGraph({
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
        ? await this.chartGenerator.getLineGraph({
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
        ? await this.chartGenerator.getStackedAreaGraph({
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

  private async reportWorkflowMetrics(): Promise<string> {
    const statsData = this.dataRepository.load();
    const stats = await this.fetchAllStats(statsData);
    const charts = await this.createMetricCharts(stats);
    return this.reportFormatter.format(charts);
  }

  async start(config: StatsCollectorConfig): Promise<boolean> {
    this.logger.info(`Starting stat collector ...`);

    try {
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (config.metricFrequency) {
        env.WORKFLOW_TELEMETRY_STAT_FREQ = `${config.metricFrequency}`;
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

      this.logger.info(`Started stat collector`);

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to start stat collector");

      return false;
    }
  }

  async finish(_currentJob: WorkflowJobType): Promise<boolean> {
    this.logger.info(`Finishing stat collector ...`);

    try {
      this.logger.info(`Finished stat collector`);

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to finish stat collector");

      return false;
    }
  }

  async report(
    _currentJob: WorkflowJobType
  ): Promise<string | null> {
    this.logger.info(`Reporting stat collector result ...`);

    try {
      const postContent: string = await this.reportWorkflowMetrics();

      this.logger.info(`Reported stat collector result`);

      return postContent;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to report stat collector result");

      return null;
    }
  }
}

const logger = new Logger();
const chartGenerator = new StatsChartGenerator(logger);
const reportFormatter = new StatsReportFormatter();
const dataRepository = new StatsDataRepository(logger);

export const start = (config: StatsCollectorConfig) => {
  const statsCollector = new StatsCollector(
    logger,
    chartGenerator,
    reportFormatter,
    dataRepository
  );
  return statsCollector.start(config);
};

export const finish = (currentJob: WorkflowJobType) => {
  const statsCollector = new StatsCollector(
    logger,
    chartGenerator,
    reportFormatter,
    dataRepository
  );
  return statsCollector.finish(currentJob);
};

export const report = (currentJob: WorkflowJobType) => {
  const statsCollector = new StatsCollector(
    logger,
    chartGenerator,
    reportFormatter,
    dataRepository
  );
  return statsCollector.report(currentJob);
};
