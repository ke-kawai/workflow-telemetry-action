import { PROCESS_TRACE } from "../../constants";
import { CompletedProcess, ProcessTracerConfig } from "./types";

const GHA_FILE_NAME_PREFIX = PROCESS_TRACE.GHA_FILE_PREFIX;

export class ProcessChartGenerator {
  private generateMermaidContent(
    processes: CompletedProcess[],
    config: ProcessTracerConfig,
    jobName: string
  ): string {
    let mermaidContent = "";

    mermaidContent = mermaidContent.concat("gantt", "\n");
    mermaidContent = mermaidContent.concat("\t", `title ${jobName}`, "\n");
    mermaidContent = mermaidContent.concat("\t", `dateFormat x`, "\n");
    mermaidContent = mermaidContent.concat("\t", `axisFormat %H:%M:%S`, "\n");

    const processesForChart = [...processes]
      .sort((a, b) => -(a.duration - b.duration))
      .slice(0, config.chartMaxCount)
      .sort((a, b) => a.started - b.started);

    for (const proc of processesForChart) {
      const extraProcessInfo: string | null = this.getExtraProcessInfo(proc);
      const escapedName = proc.name.replace(/:/g, "#colon;");
      if (extraProcessInfo) {
        mermaidContent = mermaidContent.concat(
          "\t",
          `${escapedName} (${extraProcessInfo}) : `
        );
      } else {
        mermaidContent = mermaidContent.concat("\t", `${escapedName} : `);
      }

      const startTime: number = proc.started;
      const finishTime: number = proc.ended;
      mermaidContent = mermaidContent.concat(
        `${startTime}, ${finishTime}`,
        "\n"
      );
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
