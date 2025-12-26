import path from "path";
import fs from "fs";
import * as core from "@actions/core";
import si from "systeminformation";
import { WorkflowJobType } from "../../interfaces";
import * as logger from "../../utils/logger";

const PROC_TRACER_STATE_FILE = path.join(__dirname, "../.proc-tracer-started");
const PROC_TRACER_DATA_FILE = path.join(__dirname, "../proc-tracer-data.json");
const DEFAULT_PROC_TRACE_CHART_MAX_COUNT = 100;
const GHA_FILE_NAME_PREFIX = "/home/runner/work/_actions/";
const COLLECTION_INTERVAL_MS = 1000; // Collect process info every 1 second

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
  } catch (error: any) {
    logger.error(`Error collecting processes: ${error.message}`);
  }
}

function saveData(): void {
  try {
    const data = {
      completed: completedProcesses,
      tracked: Array.from(trackedProcesses.values()),
    };
    fs.writeFileSync(PROC_TRACER_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error: any) {
    logger.error(`Error saving process data: ${error.message}`);
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
  } catch (error: any) {
    logger.error(`Error loading process data: ${error.message}`);
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
  } catch (error: any) {
    logger.error("Unable to start process tracer");
    logger.error(error);

    return false;
  }
}

export async function finish(currentJob: WorkflowJobType): Promise<boolean> {
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
    for (const [pid, tracked] of trackedProcesses.entries()) {
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
  } catch (error: any) {
    logger.error("Unable to finish process tracer");
    logger.error(error);

    return false;
  }
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

    let procTraceMinDuration = -1;
    const procTraceMinDurationInput: string = core.getInput(
      "proc_trace_min_duration"
    );
    if (procTraceMinDurationInput) {
      const minProcDurationVal: number = parseInt(procTraceMinDurationInput);
      if (Number.isInteger(minProcDurationVal)) {
        procTraceMinDuration = minProcDurationVal;
      }
    }

    const procTraceChartShow: boolean =
      core.getInput("proc_trace_chart_show") === "true";
    const procTraceChartMaxCountInput: number = parseInt(
      core.getInput("proc_trace_chart_max_count")
    );
    const procTraceChartMaxCount = Number.isInteger(procTraceChartMaxCountInput)
      ? procTraceChartMaxCountInput
      : DEFAULT_PROC_TRACE_CHART_MAX_COUNT;
    const procTraceTableShow: boolean =
      core.getInput("proc_trace_table_show") === "true";

    // Filter processes by minimum duration
    let filteredProcesses = completedProcesses;
    if (procTraceMinDuration > 0) {
      filteredProcesses = completedProcesses.filter(
        (p) => p.duration >= procTraceMinDuration
      );
    }

    ///////////////////////////////////////////////////////////////////////////

    let chartContent = "";

    if (procTraceChartShow) {
      chartContent = chartContent.concat("gantt", "\n");
      chartContent = chartContent.concat(
        "\t",
        `title ${currentJob.name}`,
        "\n"
      );
      chartContent = chartContent.concat("\t", `dateFormat x`, "\n");
      chartContent = chartContent.concat("\t", `axisFormat %H:%M:%S`, "\n");

      const processesForChart = [...filteredProcesses]
        .sort((a, b) => -(a.duration - b.duration))
        .slice(0, procTraceChartMaxCount)
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
    }

    ///////////////////////////////////////////////////////////////////////////

    let tableContent = "";

    if (procTraceTableShow) {
      // Helper functions for formatting
      const padStart = (val: string | number, width: number): string =>
        String(val).padStart(width);
      const padEnd = (val: string | number, width: number): string =>
        String(val).padEnd(width);
      const formatFloat = (
        val: number,
        width: number,
        precision: number
      ): string => val.toFixed(precision).padStart(width);

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
      for (const proc of filteredProcesses) {
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

      tableContent = processInfos.join("\n");
    }

    ///////////////////////////////////////////////////////////////////////////

    const postContentItems: string[] = ["", "### Process Trace"];
    if (procTraceChartShow) {
      postContentItems.push(
        "",
        `#### Top ${procTraceChartMaxCount} processes with highest duration`,
        "",
        "```mermaid" + "\n" + chartContent + "\n" + "```"
      );
    }
    if (procTraceTableShow) {
      postContentItems.push(
        "",
        `#### All processes with detail`,
        "",
        "```" + "\n" + tableContent + "\n" + "```"
      );
    }

    const postContent: string = postContentItems.join("\n");

    logger.info(`Reported process tracer result`);

    return postContent;
  } catch (error: any) {
    logger.error("Unable to report process tracer result");
    logger.error(error);

    return null;
  }
}
