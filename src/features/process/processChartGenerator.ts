import { PROCESS_TRACE } from "../../constants";
import { CompletedProcess, ProcessTracerConfig } from "./types";

const GHA_FILE_NAME_PREFIX = PROCESS_TRACE.GHA_FILE_PREFIX;

export class ProcessChartGenerator {
  private generateGanttHeader(jobName: string): string {
    let header = "";
    header = header.concat("gantt", "\n");
    header = header.concat("\t", `title ${jobName}`, "\n");
    header = header.concat("\t", `dateFormat x`, "\n");
    header = header.concat("\t", `axisFormat %H:%M:%S`, "\n");
    return header;
  }

  private generateProcessLine(proc: CompletedProcess): string {
    let line = "";
    const extraProcessInfo: string | null = this.getExtraProcessInfo(proc);
    const escapedName = proc.name.replace(/:/g, "#colon;");

    if (extraProcessInfo) {
      line = line.concat("\t", `${escapedName} (${extraProcessInfo}) : `);
    } else {
      line = line.concat("\t", `${escapedName} : `);
    }

    const startTime: number = proc.started;
    const finishTime: number = proc.ended;
    line = line.concat(`${startTime}, ${finishTime}`, "\n");

    return line;
  }

  private selectTopProcessesByDuration(
    processes: CompletedProcess[],
    maxCount: number
  ): CompletedProcess[] {
    // Select top N processes by duration, then sort by start time for chronological display
    return [...processes]
      .sort((a, b) => -(a.duration - b.duration))  // Longest duration first
      .slice(0, maxCount)                          // Take top N
      .sort((a, b) => a.started - b.started);      // Chronological order
  }

  private generateMermaidContent(
    processes: CompletedProcess[],
    config: ProcessTracerConfig,
    jobName: string
  ): string {
    let mermaidContent = this.generateGanttHeader(jobName);

    const processesForChart = this.selectTopProcessesByDuration(
      processes,
      config.chartMaxCount
    );

    for (const proc of processesForChart) {
      mermaidContent = mermaidContent.concat(this.generateProcessLine(proc));
    }

    return mermaidContent;
  }

  generate(
    processes: CompletedProcess[],
    config: ProcessTracerConfig,
    jobName: string
  ): string {
    const mermaidContent = this.generateMermaidContent(processes, config, jobName);
    return "```mermaid\n" + mermaidContent + "```";
  }

  private getExtraProcessInfo(proc: CompletedProcess): string | null {
    // Check whether this is Node.js GHA process
    if (proc.name === "node" && proc.params && proc.params.includes(GHA_FILE_NAME_PREFIX)) {
      const match = proc.params.match(
        new RegExp(`${GHA_FILE_NAME_PREFIX}([^/]+/[^/]+)`)
      );
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }
}
