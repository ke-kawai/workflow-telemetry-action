import { ProcessTracerConfig } from "../../config/types";

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
        chartContent
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
