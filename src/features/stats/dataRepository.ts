import path from "path";
import fs from "fs";
import { Logger } from "../../utils/logger";
import {
  CPUStats,
  DiskSizeStats,
  DiskStats,
  MemoryStats,
  NetworkStats,
} from "./types";

const STATS_DATA_FILE = path.join(__dirname, "../", "stats-data.json");

export interface StatsData {
  cpu: CPUStats[];
  memory: MemoryStats[];
  network: NetworkStats[];
  disk: DiskStats[];
  diskSize: DiskSizeStats[];
}

export class StatsDataRepository {
  constructor(private logger: Logger) {}

  load(): StatsData | null {
    try {
      if (fs.existsSync(STATS_DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATS_DATA_FILE, "utf-8"));
        this.logger.debug("Loaded stats data from file");
        return data;
      }
      this.logger.debug("Stats data file does not exist");
      return null;
    } catch (error: unknown) {
      this.logger.error(error, "Error loading stats data");
      return null;
    }
  }
}
