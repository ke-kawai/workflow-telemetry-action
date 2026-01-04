import path from "path";
import fs from "fs";
import { Logger } from "../../utils/logger";
import { TrackedProcess, CompletedProcess } from "./types";

const PROC_TRACER_DATA_FILE = path.join(__dirname, "../", "proc-tracer-data.json");

interface ProcessData {
  completed: CompletedProcess[];
  tracked: TrackedProcess[];
}

export class ProcessDataRepository {
  constructor(private logger: Logger) {}

  save(data: ProcessData): void {
    try {
      fs.writeFileSync(PROC_TRACER_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      this.logger.error(error, "Error saving process data");
    }
  }

  load(): ProcessData {
    try {
      if (fs.existsSync(PROC_TRACER_DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROC_TRACER_DATA_FILE, "utf-8"));
        return {
          completed: data.completed || [],
          tracked: data.tracked || [],
        };
      }
    } catch (error: unknown) {
      this.logger.error(error, "Error loading process data");
    }
    return { completed: [], tracked: [] };
  }
}
