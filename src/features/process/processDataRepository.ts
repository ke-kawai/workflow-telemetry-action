import path from "path";
import fs from "fs";
import { Logger } from "../../utils/logger";
import { TrackedProcess, CompletedProcess } from "./types";
import { FILE_PATHS } from "../../constants";

const PROC_TRACER_DATA_FILE = path.join(__dirname, "../", FILE_PATHS.PROC_TRACER_DATA);

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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(err, "Error saving process data");
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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(err, "Error loading process data");
    }
    return { completed: [], tracked: [] };
  }
}
