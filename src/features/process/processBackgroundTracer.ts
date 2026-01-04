import path from "path";
import fs from "fs";
import si from "systeminformation";
import { Logger } from "../../utils/logger";
import { TrackedProcess, CompletedProcess } from "./types";

const logger = new Logger();

const PROC_TRACER_DATA_FILE = path.join(__dirname, "../", "proc-tracer-data.json");
const COLLECTION_INTERVAL_MS = 1000;

interface ProcessData {
  completed: CompletedProcess[];
  tracked: TrackedProcess[];
}

class ProcessBackgroundTracer {
  private expectedScheduleTime: number = 0;
  private trackedProcesses = new Map<number, TrackedProcess>();
  private completedProcesses: CompletedProcess[] = [];

  private async collectProcesses(triggeredFromScheduler: boolean = true): Promise<void> {
    try {
      const processes = await si.processes();
      const currentPids = new Set<number>();
      const now = Date.now();

      // Update tracked processes
      for (const proc of processes.list) {
        if (!proc.pid) continue;

        currentPids.add(proc.pid);

        if (this.trackedProcesses.has(proc.pid)) {
          // Update existing process
          const tracked = this.trackedProcesses.get(proc.pid)!;
          tracked.pcpu = Math.max(tracked.pcpu, proc.cpu || 0);
          tracked.pmem = Math.max(tracked.pmem, proc.mem || 0);
        } else {
          // New process
          this.trackedProcesses.set(proc.pid, {
            pid: proc.pid,
            name: proc.name || "unknown",
            command: proc.command || "",
            params: proc.params || "",
            started: proc.started ? new Date(proc.started).getTime() : now,
            pcpu: proc.cpu || 0,
            pmem: proc.mem || 0,
          });
        }
      }

      // Find completed processes (no longer in current list)
      for (const [pid, tracked] of this.trackedProcesses.entries()) {
        if (!currentPids.has(pid)) {
          this.completedProcesses.push({
            pid: tracked.pid,
            name: tracked.name,
            command: tracked.command,
            params: tracked.params,
            started: tracked.started,
            ended: now,
            duration: now - tracked.started,
            maxCpu: tracked.pcpu,
            maxMem: tracked.pmem,
          });
          this.trackedProcesses.delete(pid);
        }
      }

      // Save to file after collection
      this.saveData();
    } catch (error: unknown) {
      logger.error(error, "Error collecting processes");
    } finally {
      if (triggeredFromScheduler) {
        this.expectedScheduleTime += COLLECTION_INTERVAL_MS;
        setTimeout(
          () => this.collectProcesses(),
          this.expectedScheduleTime - Date.now()
        );
      }
    }
  }

  private saveData(): void {
    try {
      const data: ProcessData = {
        completed: this.completedProcesses,
        tracked: Array.from(this.trackedProcesses.values()),
      };
      fs.writeFileSync(PROC_TRACER_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      logger.error(error, "Error saving process data");
    }
  }

  init(): void {
    this.expectedScheduleTime = Date.now();

    logger.info("Starting process background tracer ...");
    process.nextTick(() => this.collectProcesses());

    logger.info(`Process tracer started with ${COLLECTION_INTERVAL_MS}ms interval`);
  }
}

// Create and initialize singleton instance
const tracer = new ProcessBackgroundTracer();
tracer.init();
