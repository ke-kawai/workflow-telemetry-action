import path from "path";
import fs from "fs";
import * as core from "@actions/core";
import si from "systeminformation";
import { WorkflowJobType } from "../../interfaces";
import * as logger from "../../utils/logger";
import { padStart, padEnd, formatFloat } from "../../utils/formatter";
import { PROCESS_TRACE, FILE_PATHS } from "../../constants";

const PROC_TRACER_STATE_FILE = path.join(__dirname, "../", FILE_PATHS.PROC_TRACER_STATE);
const PROC_TRACER_DATA_FILE = path.join(__dirname, "../", FILE_PATHS.PROC_TRACER_DATA);
const DEFAULT_PROC_TRACE_CHART_MAX_COUNT = PROCESS_TRACE.DEFAULT_CHART_MAX_COUNT;
const GHA_FILE_NAME_PREFIX = PROCESS_TRACE.GHA_FILE_PREFIX;
const COLLECTION_INTERVAL_MS = PROCESS_TRACE.COLLECTION_INTERVAL_MS;

interface TrackedProcess {
  pid: number;
  name: string;
  command: string;
  params: string;
  started: number;
  pcpu: number;
  pmem: number;
}

interface CompletedProcess {
  pid: number;
  name: string;
  command: string;
  params: string;
  started: number;
  ended: number;
  duration: number;
  maxCpu: number;
  maxMem: number;
}

let collectionInterval: NodeJS.Timeout | null = null;
let trackedProcesses = new Map<number, TrackedProcess>();
let completedProcesses: CompletedProcess[] = [];
let finished = false;

async function collectProcesses(): Promise<void> {
  try {
    const processes = await si.processes();
    const currentPids = new Set<number>();
    const now = Date.now();

    // Update tracked processes
    for (const proc of processes.list) {
      if (!proc.pid) continue;

      currentPids.add(proc.pid);

      if (trackedProcesses.has(proc.pid)) {
        // Update existing process
        const tracked = trackedProcesses.get(proc.pid)!;
        tracked.pcpu = Math.max(tracked.pcpu, proc.cpu || 0);
        tracked.pmem = Math.max(tracked.pmem, proc.mem || 0);
      } else {
        // New process
        trackedProcesses.set(proc.pid, {
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
    for (const [pid, tracked] of trackedProcesses.entries()) {
      if (!currentPids.has(pid)) {
        completedProcesses.push({
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
        trackedProcesses.delete(pid);
      }
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error collecting processes");
  }
}

function saveData(): void {
  try {
    const data = {
      completed: completedProcesses,
      tracked: Array.from(trackedProcesses.values()),
    };
    fs.writeFileSync(PROC_TRACER_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error saving process data");
  }
}

function loadData(): void {
  try {
    if (fs.existsSync(PROC_TRACER_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROC_TRACER_DATA_FILE, "utf-8"));
      completedProcesses = data.completed || [];
      if (data.tracked) {
        trackedProcesses = new Map(
          data.tracked.map((p: TrackedProcess) => [p.pid, p])
        );
      }
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Error loading process data");
  }
}

function getExtraProcessInfo(proc: CompletedProcess): string | null {
  // Check whether this is node process with args
  if (proc.name === "node" && proc.params) {
    // Check whether this is Node.js GHA process
    if (proc.params.includes(GHA_FILE_NAME_PREFIX)) {
      const match = proc.params.match(
        new RegExp(`${GHA_FILE_NAME_PREFIX}([^/]+/[^/]+)`)
      );
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  return null;
}

///////////////////////////

export async function start(): Promise<boolean> {
  logger.info(`Starting process tracer ...`);

  try {
    // Create state file to indicate tracer is started
    fs.writeFileSync(PROC_TRACER_STATE_FILE, Date.now().toString());

    // Start collecting processes
    await collectProcesses();

    collectionInterval = setInterval(async () => {
      await collectProcesses();
      saveData();
    }, COLLECTION_INTERVAL_MS);

    // Prevent the interval from keeping the process alive
    collectionInterval.unref();

    logger.info(
      `Started process tracer with ${COLLECTION_INTERVAL_MS}ms interval`
    );

    return true;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to start process tracer");

    return false;
  }
}

export async function finish(_currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing process tracer ...`);

  if (!fs.existsSync(PROC_TRACER_STATE_FILE)) {
    logger.info(
      `Skipped finishing process tracer since process tracer didn't started`
    );
    return false;
  }

  try {
    // Stop collection interval
    if (collectionInterval) {
      clearInterval(collectionInterval);
      collectionInterval = null;
    }

    // Final collection
    await collectProcesses();

    // Mark any remaining tracked processes as completed
    const now = Date.now();
    for (const [_pid, tracked] of trackedProcesses.entries()) {
      completedProcesses.push({
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
    trackedProcesses.clear();

    // Save final data
    saveData();
    finished = true;

    logger.info(`Finished process tracer`);

    return true;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to finish process tracer");

    return false;
  }
}

interface ProcessTracerConfig {
  minDuration: number;
  chartShow: boolean;
  chartMaxCount: number;
  tableShow: boolean;
}

function parseConfiguration(): ProcessTracerConfig {
  let minDuration = -1;
  const procTraceMinDurationInput: string = core.getInput(
    "proc_trace_min_duration"
  );
  if (procTraceMinDurationInput) {
    const minProcDurationVal: number = parseInt(procTraceMinDurationInput);
    if (Number.isInteger(minProcDurationVal)) {
      minDuration = minProcDurationVal;
    }
  }

  const chartShow: boolean = core.getInput("proc_trace_chart_show") === "true";
  const procTraceChartMaxCountInput: number = parseInt(
    core.getInput("proc_trace_chart_max_count")
  );
  const chartMaxCount = Number.isInteger(procTraceChartMaxCountInput)
    ? procTraceChartMaxCountInput
    : DEFAULT_PROC_TRACE_CHART_MAX_COUNT;
  const tableShow: boolean = core.getInput("proc_trace_table_show") === "true";

  return { minDuration, chartShow, chartMaxCount, tableShow };
}

function generateProcessChart(
  processes: CompletedProcess[],
  config: ProcessTracerConfig,
  jobName: string
): string {
  let chartContent = "";

  chartContent = chartContent.concat("gantt", "\n");
  chartContent = chartContent.concat("\t", `title ${jobName}`, "\n");
  chartContent = chartContent.concat("\t", `dateFormat x`, "\n");
  chartContent = chartContent.concat("\t", `axisFormat %H:%M:%S`, "\n");

  const processesForChart = [...processes]
    .sort((a, b) => -(a.duration - b.duration))
    .slice(0, config.chartMaxCount)
    .sort((a, b) => a.started - b.started);

  for (const proc of processesForChart) {
    const extraProcessInfo: string | null = getExtraProcessInfo(proc);
    const escapedName = proc.name.replace(/:/g, "#colon;");
    if (extraProcessInfo) {
      chartContent = chartContent.concat(
        "\t",
        `${escapedName} (${extraProcessInfo}) : `
      );
    } else {
      chartContent = chartContent.concat("\t", `${escapedName} : `);
    }

    const startTime: number = proc.started;
    const finishTime: number = proc.ended;
    chartContent = chartContent.concat(
      `${Math.min(startTime, finishTime)}, ${finishTime}`,
      "\n"
    );
  }

  return chartContent;
}

function generateProcessTable(processes: CompletedProcess[]): string {
  const processInfos: string[] = [];
  processInfos.push(
    `${padEnd("NAME", 16)} ${padStart("PID", 7)} ${padStart(
      "START TIME",
      15
    )} ${padStart("DURATION (ms)", 15)} ${padStart(
      "MAX CPU %",
      10
    )} ${padStart("MAX MEM %", 10)} ${padEnd("COMMAND + PARAMS", 40)}`
  );
  for (const proc of processes) {
    processInfos.push(
      `${padEnd(proc.name, 16)} ${padStart(proc.pid, 7)} ${padStart(
        proc.started,
        15
      )} ${padStart(proc.duration, 15)} ${formatFloat(
        proc.maxCpu,
        10,
        2
      )} ${formatFloat(proc.maxMem, 10, 2)} ${proc.command} ${proc.params}`
    );
  }

  return processInfos.join("\n");
}

function formatProcessReport(
  chartContent: string,
  tableContent: string,
  config: ProcessTracerConfig
): string {
  const postContentItems: string[] = ["", "### Process Trace"];

  if (config.chartShow) {
    postContentItems.push(
      "",
      `#### Top ${config.chartMaxCount} processes with highest duration`,
      "",
      "```mermaid" + "\n" + chartContent + "\n" + "```"
    );
  }
  if (config.tableShow) {
    postContentItems.push(
      "",
      `#### All processes with detail`,
      "",
      "```" + "\n" + tableContent + "\n" + "```"
    );
  }

  return postContentItems.join("\n");
}

export async function report(
  currentJob: WorkflowJobType
): Promise<string | null> {
  logger.info(`Reporting process tracer result ...`);

  if (!finished) {
    logger.info(
      `Skipped reporting process tracer since process tracer didn't finished`
    );
    return null;
  }

  try {
    // Load data from file
    loadData();

    logger.info(`Getting process tracer result from data file ...`);

    const config = parseConfiguration();

    // Filter processes by minimum duration
    let filteredProcesses = completedProcesses;
    if (config.minDuration > 0) {
      filteredProcesses = completedProcesses.filter(
        (p) => p.duration >= config.minDuration
      );
    }

    const chartContent = config.chartShow
      ? generateProcessChart(filteredProcesses, config, currentJob.name)
      : "";
    const tableContent = config.tableShow
      ? generateProcessTable(filteredProcesses)
      : "";

    const postContent = formatProcessReport(chartContent, tableContent, config);

    logger.info(`Reported process tracer result`);

    return postContent;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err, "Unable to report process tracer result");

    return null;
  }
}
