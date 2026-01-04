import { CompletedProcess } from "./types";
import { ProcessTracerConfig } from "../../config/types";

const GHA_FILE_NAME_PREFIX = "/home/runner/work/_actions/";

export class ProcessChartGenerator {
  private generateGanttHeader(jobName: string): string {
    const lines = [
      "gantt",
      `\ttitle ${jobName}`,
      `\tdateFormat x`,
      `\taxisFormat %H:%M:%S`,
    ];
    return lines.join("\n") + "\n";
  }

  private generateProcessLine(proc: CompletedProcess): string {
    const extraProcessInfo: string | null = this.getExtraProcessInfo(proc);
    const escapedName = proc.name.replace(/:/g, "#colon;");

    const nameWithInfo = extraProcessInfo
      ? `\t${escapedName} (${extraProcessInfo}) : `
      : `\t${escapedName} : `;

    const startTime: number = proc.started;
    const finishTime: number = proc.ended;

    return `${nameWithInfo}${startTime}, ${finishTime}\n`;
  }

  // Select top N processes by duration, then sort by start time for chronological display
  private selectTopProcessesByDuration(
    processes: CompletedProcess[],
    maxCount: number
  ): CompletedProcess[] {
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
    const processesForChart = this.selectTopProcessesByDuration(
      processes,
      config.chartMaxCount
    );

    const header = this.generateGanttHeader(jobName);
    const processLines = processesForChart.map(proc => this.generateProcessLine(proc)).join("");

    return header + processLines;
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
