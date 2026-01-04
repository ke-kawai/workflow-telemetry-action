import path from "path";
import fs from "fs";
import si from "systeminformation";
import { Logger } from "../../utils/logger";
import {
  CPUStats,
  MemoryStats,
  DiskStats,
  NetworkStats,
  DiskSizeStats,
} from "./types";

const logger = new Logger();

const DEFAULT_FREQUENCY_MS = 5000;
const STATS_FREQ: number =
  parseInt(process.env.WORKFLOW_TELEMETRY_STAT_FREQ || "") ||
  DEFAULT_FREQUENCY_MS;

const STATS_DATA_FILE = path.join(__dirname, "../", "stats-data.json");

interface StatsCollector<T, D> {
  histogram: T[];
  fetch: () => Promise<D>;
  transform: (data: D, statTime: number, timeInterval: number) => T;
}

// Union type of all possible StatsCollector configurations
type AnyStatsCollector =
  | StatsCollector<CPUStats, si.Systeminformation.CurrentLoadData>
  | StatsCollector<MemoryStats, si.Systeminformation.MemData>
  | StatsCollector<NetworkStats, si.Systeminformation.NetworkStatsData[]>
  | StatsCollector<DiskStats, si.Systeminformation.FsStatsData>
  | StatsCollector<DiskSizeStats, si.Systeminformation.FsSizeData[]>;

interface StatsData {
  cpu: CPUStats[];
  memory: MemoryStats[];
  network: NetworkStats[];
  disk: DiskStats[];
  diskSize: DiskSizeStats[];
}

class StatsBackgroundCollector {
  private expectedScheduleTime: number = 0;
  private statCollectTime: number = 0;

  // Histograms
  private cpuStatsHistogram: CPUStats[] = [];
  private memoryStatsHistogram: MemoryStats[] = [];
  private networkStatsHistogram: NetworkStats[] = [];
  private diskStatsHistogram: DiskStats[] = [];
  private diskSizeStatsHistogram: DiskSizeStats[] = [];

  // Stats collectors configuration
  private statsCollectors: AnyStatsCollector[] = [
    // CPU Stats
    {
      histogram: this.cpuStatsHistogram,
      fetch: () => si.currentLoad(),
      transform: (
        data: si.Systeminformation.CurrentLoadData,
        statTime: number
      ) => ({
        time: statTime,
        totalLoad: data.currentLoad,
        userLoad: data.currentLoadUser,
        systemLoad: data.currentLoadSystem,
      }),
    },
    // Memory Stats
    {
      histogram: this.memoryStatsHistogram,
      fetch: () => si.mem(),
      transform: (data: si.Systeminformation.MemData, statTime: number) => ({
        time: statTime,
        totalMemoryMb: data.total / 1024 / 1024,
        activeMemoryMb: data.active / 1024 / 1024,
        availableMemoryMb: data.available / 1024 / 1024,
      }),
    },
    // Network Stats
    {
      histogram: this.networkStatsHistogram,
      fetch: () => si.networkStats(),
      transform: (
        data: si.Systeminformation.NetworkStatsData[],
        statTime: number,
        timeInterval: number
      ) => {
        let totalRxSec = 0,
          totalTxSec = 0;
        for (let nsd of data) {
          totalRxSec += nsd.rx_sec;
          totalTxSec += nsd.tx_sec;
        }
        return {
          time: statTime,
          rxMb: Math.floor((totalRxSec * (timeInterval / 1000)) / 1024 / 1024),
          txMb: Math.floor((totalTxSec * (timeInterval / 1000)) / 1024 / 1024),
        };
      },
    },
    // Disk Stats
    {
      histogram: this.diskStatsHistogram,
      fetch: () => si.fsStats(),
      transform: (
        data: si.Systeminformation.FsStatsData,
        statTime: number,
        timeInterval: number
      ) => {
        const rxSec = data.rx_sec ?? 0;
        const wxSec = data.wx_sec ?? 0;
        return {
          time: statTime,
          rxMb: Math.floor((rxSec * (timeInterval / 1000)) / 1024 / 1024),
          wxMb: Math.floor((wxSec * (timeInterval / 1000)) / 1024 / 1024),
        };
      },
    },
    // Disk Size Stats
    {
      histogram: this.diskSizeStatsHistogram,
      fetch: () => si.fsSize(),
      transform: (data: si.Systeminformation.FsSizeData[], statTime: number) => {
        let totalSize = 0,
          usedSize = 0;
        for (let fsd of data) {
          totalSize += fsd.size;
          usedSize += fsd.used;
        }
        return {
          time: statTime,
          availableSizeMb: Math.floor((totalSize - usedSize) / 1024 / 1024),
          usedSizeMb: Math.floor(usedSize / 1024 / 1024),
        };
      },
    },
  ];

  private async collectStatsForCollector<T, D>(
    collector: StatsCollector<T, D>,
    statTime: number,
    timeInterval: number
  ): Promise<void> {
    try {
      const data = await collector.fetch();
      const stats = collector.transform(data, statTime, timeInterval);
      collector.histogram.push(stats);
    } catch (error: unknown) {
      logger.error(error);
    }
  }

  private saveData(): void {
    try {
      const data: StatsData = {
        cpu: this.cpuStatsHistogram,
        memory: this.memoryStatsHistogram,
        network: this.networkStatsHistogram,
        disk: this.diskStatsHistogram,
        diskSize: this.diskSizeStatsHistogram,
      };
      fs.writeFileSync(STATS_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      logger.error(error, "Error saving stats data");
    }
  }

  private async collectStats(triggeredFromScheduler: boolean = true): Promise<void> {
    try {
      const currentTime: number = Date.now();
      const timeInterval: number = this.statCollectTime
        ? currentTime - this.statCollectTime
        : 0;

      this.statCollectTime = currentTime;

      const promises: Promise<void>[] = this.statsCollectors.map((collector) =>
        this.collectStatsForCollector(collector as any, this.statCollectTime, timeInterval)
      );

      await Promise.all(promises);

      // Save to file after collection
      this.saveData();
    } finally {
      if (triggeredFromScheduler) {
        this.expectedScheduleTime += STATS_FREQ;
        setTimeout(() => this.collectStats(), this.expectedScheduleTime - Date.now());
      }
    }
  }

  init(): void {
    this.expectedScheduleTime = Date.now();

    logger.info("Starting stats background collector ...");
    process.nextTick(() => this.collectStats());

    logger.info(`Stats collector started with ${STATS_FREQ}ms interval`);
  }
}

// Create and initialize singleton instance
const collector = new StatsBackgroundCollector();
collector.init();
