import path from "path";
import fs from "fs";
import si from "systeminformation";
import { WorkflowJobType } from "../../interfaces";
import { Logger } from "../../utils/logger";
import { ProcessChartGenerator } from "./processChartGenerator";
import { ProcessTableGenerator } from "./processTableGenerator";
import { ProcessReportFormatter } from "./processReportFormatter";
import { ProcessDataRepository } from "./processDataRepository";
import { ProcessTracerConfig } from "../../config/types";
import { TrackedProcess, CompletedProcess } from "./types";

const PROC_TRACER_STATE_FILE = path.join(__dirname, "../", ".proc-tracer-started");
const COLLECTION_INTERVAL_MS = 1000;

class ProcessTracer {
  private collectionInterval: NodeJS.Timeout | null = null;
  private trackedProcesses = new Map<number, TrackedProcess>();
  private completedProcesses: CompletedProcess[] = [];
  private finished = false;

  constructor(
    private logger: Logger,
    private chartGenerator: ProcessChartGenerator,
    private tableGenerator: ProcessTableGenerator,
    private reportFormatter: ProcessReportFormatter,
    private config: ProcessTracerConfig,
    private dataRepository: ProcessDataRepository
  ) { }

  private async collectProcesses(): Promise<void> {
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
    } catch (error: unknown) {
      this.logger.error(error, "Error collecting processes");
    }
  }

  private saveData(): void {
    const data = {
      completed: this.completedProcesses,
      tracked: Array.from(this.trackedProcesses.values()),
    };
    this.dataRepository.save(data);
  }

  private loadData(): void {
    const data = this.dataRepository.load();
    this.completedProcesses = data.completed;
    this.trackedProcesses = new Map(
      data.tracked.map((p: TrackedProcess) => [p.pid, p])
    );
  }

  async start(): Promise<boolean> {
    this.logger.info(`Starting process tracer ...`);

    try {
      fs.writeFileSync(PROC_TRACER_STATE_FILE, Date.now().toString());

      await this.collectProcesses();

      this.collectionInterval = setInterval(async () => {
        await this.collectProcesses();
        this.saveData();
      }, COLLECTION_INTERVAL_MS);

      // Prevent the interval from keeping the process alive
      this.collectionInterval.unref();

      this.logger.info(
        `Started process tracer with ${COLLECTION_INTERVAL_MS}ms interval`
      );

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to start process tracer");

      return false;
    }
  }

  async finish(_currentJob: WorkflowJobType): Promise<boolean> {
    this.logger.info(`Finishing process tracer ...`);

    if (!fs.existsSync(PROC_TRACER_STATE_FILE)) {
      this.logger.info(
        `Skipped finishing process tracer since process tracer didn't started`
      );
      return false;
    }

    try {
      // Stop collection interval
      if (this.collectionInterval) {
        clearInterval(this.collectionInterval);
        this.collectionInterval = null;
      }

      // Final collection
      await this.collectProcesses();

      // Mark any remaining tracked processes as completed
      const now = Date.now();
      for (const [_pid, tracked] of this.trackedProcesses.entries()) {
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
      }
      this.trackedProcesses.clear();

      this.saveData();
      this.finished = true;

      this.logger.info(`Finished process tracer`);

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to finish process tracer");

      return false;
    }
  }

  async report(
    currentJob: WorkflowJobType
  ): Promise<string | null> {
    this.logger.info(`Reporting process tracer result ...`);

    if (!this.finished) {
      this.logger.info(
        `Skipped reporting process tracer since process tracer didn't finished`
      );
      return null;
    }

    try {
      this.loadData();

      this.logger.info(`Getting process tracer result from data file ...`);

      // Filter processes by minimum duration
      let filteredProcesses = this.completedProcesses;
      if (this.config.minDuration > 0) {
        filteredProcesses = this.completedProcesses.filter(
          (p) => p.duration >= this.config.minDuration
        );
      }

      const chartContent = this.config.chartShow
        ? this.chartGenerator.generate(filteredProcesses, this.config, currentJob.name)
        : "";
      const tableContent = this.config.tableShow
        ? this.tableGenerator.generate(filteredProcesses)
        : "";

      const postContent = this.reportFormatter.format(chartContent, tableContent, this.config);

      this.logger.info(`Reported process tracer result`);

      return postContent;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to report process tracer result");

      return null;
    }
  }
}

const logger = new Logger();
const chartGenerator = new ProcessChartGenerator();
const tableGenerator = new ProcessTableGenerator();
const reportFormatter = new ProcessReportFormatter();
const dataRepository = new ProcessDataRepository(logger);

export const start = (config: ProcessTracerConfig) => {
  const processTracer = new ProcessTracer(
    logger,
    chartGenerator,
    tableGenerator,
    reportFormatter,
    config,
    dataRepository
  );
  return processTracer.start();
};

export const finish = (config: ProcessTracerConfig, currentJob: WorkflowJobType) => {
  const processTracer = new ProcessTracer(
    logger,
    chartGenerator,
    tableGenerator,
    reportFormatter,
    config,
    dataRepository
  );
  return processTracer.finish(currentJob);
};

export const report = (config: ProcessTracerConfig, currentJob: WorkflowJobType) => {
  const processTracer = new ProcessTracer(
    logger,
    chartGenerator,
    tableGenerator,
    reportFormatter,
    config,
    dataRepository
  );
  return processTracer.report(currentJob);
};
