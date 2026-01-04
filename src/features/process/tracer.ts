import path from "path";
import fs from "fs";
import { ChildProcess, spawn } from "child_process";
import { WorkflowJobType } from "../../interfaces";
import { Logger } from "../../utils/logger";
import { ProcessChartGenerator } from "./chartGenerator";
import { ProcessTableGenerator } from "./tableGenerator";
import { ProcessReportFormatter } from "./reportFormatter";
import { ProcessDataRepository } from "./dataRepository";
import { ProcessTracerConfig } from "../../config/types";
import { CompletedProcess } from "./types";

const PROC_TRACER_STATE_FILE = path.join(__dirname, "../", ".proc-tracer-started");

class ProcessTracer {
  private completedProcesses: CompletedProcess[] = [];

  constructor(
    private logger: Logger,
    private chartGenerator: ProcessChartGenerator,
    private tableGenerator: ProcessTableGenerator,
    private reportFormatter: ProcessReportFormatter,
    private config: ProcessTracerConfig,
    private dataRepository: ProcessDataRepository
  ) { }

  private loadData(): void {
    const data = this.dataRepository.load();
    this.completedProcesses = data.completed;
  }

  async start(): Promise<boolean> {
    this.logger.info(`Starting process tracer ...`);

    try {
      fs.writeFileSync(PROC_TRACER_STATE_FILE, Date.now().toString());

      const child: ChildProcess = spawn(
        process.execPath,
        [path.join(__dirname, "../pcw/index.js")],
        {
          detached: true,
          stdio: "ignore",
        }
      );
      child.unref();

      this.logger.info(`Started process tracer`);

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
        `Skipped finishing process tracer since process tracer didn't start`
      );
      return false;
    }

    try {
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

    if (!fs.existsSync(PROC_TRACER_STATE_FILE)) {
      this.logger.info(
        `Skipped reporting process tracer since process tracer didn't start`
      );
      return null;
    }

    try {
      this.loadData();

      if (this.completedProcesses.length === 0) {
        this.logger.info(`No process data to report`);
        return null;
      }

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
