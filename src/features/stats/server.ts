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

let expectedScheduleTime: number = 0;
let statCollectTime: number = 0;

interface StatsCollector<T, D> {
  histogram: T[];
  fetch: () => Promise<D>;
  transform: (data: D, statTime: number, timeInterval: number) => T;
}

// Histograms
const cpuStatsHistogram: CPUStats[] = [];
const memoryStatsHistogram: MemoryStats[] = [];
const networkStatsHistogram: NetworkStats[] = [];
const diskStatsHistogram: DiskStats[] = [];
const diskSizeStatsHistogram: DiskSizeStats[] = [];

// Stats collectors configuration
const statsCollectors: StatsCollector<any, any>[] = [
  // CPU Stats
  {
    histogram: cpuStatsHistogram,
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
    histogram: memoryStatsHistogram,
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
    histogram: networkStatsHistogram,
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
    histogram: diskStatsHistogram,
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
    histogram: diskSizeStatsHistogram,
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

async function collectStatsForCollector<T, D>(
  collector: StatsCollector<T, D>,
  statTime: number,
  timeInterval: number
): Promise<void> {
  try {
    const data = await collector.fetch();
    const stats = collector.transform(data, statTime, timeInterval);
    collector.histogram.push(stats);
  } catch (error: unknown) {
    logger.error(error instanceof Error ? error : String(error));
  }
}

async function collectStats(triggeredFromScheduler: boolean = true) {
  try {
    const currentTime: number = Date.now();
    const timeInterval: number = statCollectTime
      ? currentTime - statCollectTime
      : 0;

    statCollectTime = currentTime;

    const promises: Promise<void>[] = statsCollectors.map((collector) =>
      collectStatsForCollector(collector, statCollectTime, timeInterval)
    );

    return promises;
  } finally {
    if (triggeredFromScheduler) {
      expectedScheduleTime += STATS_FREQ;
      setTimeout(collectStats, expectedScheduleTime - Date.now());
    }
  }
}

///////////////////////////

// HTTP Server Routes
///////////////////////////

interface Route {
  method: "GET" | "POST";
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void;
}

const routes = new Map<string, Route>([
  [
    "/cpu",
    {
      method: "GET",
      handler: (_, response) => {
        response.end(JSON.stringify(cpuStatsHistogram));
      },
    },
  ],
  [
    "/memory",
    {
      method: "GET",
      handler: (_, response) => {
        response.end(JSON.stringify(memoryStatsHistogram));
      },
    },
  ],
  [
    "/network",
    {
      method: "GET",
      handler: (_, response) => {
        response.end(JSON.stringify(networkStatsHistogram));
      },
    },
  ],
  [
    "/disk",
    {
      method: "GET",
      handler: (_, response) => {
        response.end(JSON.stringify(diskStatsHistogram));
      },
    },
  ],
  [
    "/disk_size",
    {
      method: "GET",
      handler: (_, response) => {
        response.end(JSON.stringify(diskSizeStatsHistogram));
      },
    },
  ],
  [
    "/collect",
    {
      method: "POST",
      handler: async (_, response) => {
        await collectStats(false);
        response.end();
      },
    },
  ],
]);

function startHttpServer() {
  const server: Server = createServer(
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
        logger.error(error instanceof Error ? error : String(error));
        response.statusCode = 500;
        response.end(
          JSON.stringify({
            type: error instanceof Error && 'type' in error ? (error as any).type : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
  );

  server.listen(SERVER.PORT, SERVER.HOST, () => {
    logger.info(`Stat server listening on port ${SERVER.PORT}`);
  });
}

function init() {
  expectedScheduleTime = Date.now();

  logger.info("Starting stat collector ...");
  process.nextTick(collectStats);

  logger.info("Starting HTTP server ...");
  startHttpServer();
}

init();
