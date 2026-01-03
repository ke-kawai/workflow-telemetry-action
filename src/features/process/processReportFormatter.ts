import { ProcessTracerConfig } from "./types";

export class ProcessReportFormatter {
  format(
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
}
