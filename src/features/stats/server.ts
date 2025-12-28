import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import si from "systeminformation";
import * as logger from "../../utils/logger";
import {
  CPUStats,
  MemoryStats,
  DiskStats,
  NetworkStats,
  DiskSizeStats,
} from "../../interfaces";
import { SERVER, STATS_COLLECTION } from "../../constants";

const STATS_FREQ: number =
  parseInt(process.env.WORKFLOW_TELEMETRY_STAT_FREQ || "") ||
  STATS_COLLECTION.DEFAULT_FREQUENCY_MS;

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

interface Route {
  method: "GET" | "POST";
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void;
}

class StatsCollectorServer {
  private expectedScheduleTime: number = 0;
  private statCollectTime: number = 0;
  private server: Server | null = null;

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
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(err);
    }
  }

  private async collectStats(triggeredFromScheduler: boolean = true) {
    try {
      const currentTime: number = Date.now();
      const timeInterval: number = this.statCollectTime
        ? currentTime - this.statCollectTime
        : 0;

      this.statCollectTime = currentTime;

      const promises: Promise<void>[] = this.statsCollectors.map((collector) =>
        this.collectStatsForCollector(collector as any, this.statCollectTime, timeInterval)
      );

      return promises;
    } finally {
      if (triggeredFromScheduler) {
        this.expectedScheduleTime += STATS_FREQ;
        setTimeout(() => this.collectStats(), this.expectedScheduleTime - Date.now());
      }
    }
  }

  private getRoutes(): Map<string, Route> {
    return new Map<string, Route>([
      [
        "/cpu",
        {
          method: "GET",
          handler: (_, response) => {
            response.end(JSON.stringify(this.cpuStatsHistogram));
          },
        },
      ],
      [
        "/memory",
        {
          method: "GET",
          handler: (_, response) => {
            response.end(JSON.stringify(this.memoryStatsHistogram));
          },
        },
      ],
      [
        "/network",
        {
          method: "GET",
          handler: (_, response) => {
            response.end(JSON.stringify(this.networkStatsHistogram));
          },
        },
      ],
      [
        "/disk",
        {
          method: "GET",
          handler: (_, response) => {
            response.end(JSON.stringify(this.diskStatsHistogram));
          },
        },
      ],
      [
        "/disk_size",
        {
          method: "GET",
          handler: (_, response) => {
            response.end(JSON.stringify(this.diskSizeStatsHistogram));
          },
        },
      ],
      [
        "/collect",
        {
          method: "POST",
          handler: async (_, response) => {
            await this.collectStats(false);
            response.end();
          },
        },
      ],
    ]);
  }

  private startHttpServer(): void {
    const routes = this.getRoutes();

    this.server = createServer(
      async (request: IncomingMessage, response: ServerResponse) => {
        try {
          const route = routes.get(request.url || "");

          if (!route) {
            response.statusCode = 404;
            response.end();
            return;
          }

          if (request.method !== route.method) {
            response.statusCode = 405;
            response.end();
            return;
          }

          await route.handler(request, response);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error(err);
          response.statusCode = 500;
          response.end(
            JSON.stringify({
              type: 'type' in err ? (err as any).type : 'Unknown',
              message: err.message,
            })
          );
        }
      }
    );

    this.server.listen(SERVER.PORT, SERVER.HOST, () => {
      logger.info(`Stat server listening on port ${SERVER.PORT}`);
    });
  }

  init(): void {
    this.expectedScheduleTime = Date.now();

    logger.info("Starting stat collector ...");
    process.nextTick(() => this.collectStats());

    logger.info("Starting HTTP server ...");
    this.startHttpServer();
  }
}

// Create and initialize singleton instance
const server = new StatsCollectorServer();
server.init();
