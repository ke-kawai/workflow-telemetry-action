import { padStart, padEnd, formatFloat } from "../../utils/formatter";
import { CompletedProcess } from "./types";

export class ProcessTableGenerator {
  /// Formats a row for the process table
  /// Example:
  /// NAME             PID     START TIME      DURATION (ms)   MAX CPU %  MAX MEM %  COMMAND + PARAMS
  /// node            1234    1234567890000            5000       45.23      12.50  /usr/bin/node index.js
  /// python          5678    1234567895000            3000       30.15       8.20  python script.py
  private formatRow(
    name: string | number,
    pid: string | number,
    startTime: string | number,
    duration: string | number,
    maxCpu: string | number,
    maxMem: string | number,
    commandParams: string
  ): string {
    return `
      ${padEnd(name, 16)}
      ${padStart(pid, 7)}
      ${padStart(startTime, 15)}
      ${padStart(duration, 15)}
      ${padStart(maxCpu, 10)}
      ${padStart(maxMem, 10)}
      ${padEnd(commandParams, 40)}
    `;
  }

  private formatHeader(): string {
    return this.formatRow(
      "NAME",
      "PID",
      "START TIME",
      "DURATION (ms)",
      "MAX CPU %",
      "MAX MEM %",
      "COMMAND + PARAMS"
    );
  }

  private formatDataRow(proc: CompletedProcess): string {
    return this.formatRow(
      proc.name,
      proc.pid,
      proc.started,
      proc.duration,
      formatFloat(proc.maxCpu, 10, 2),
      formatFloat(proc.maxMem, 10, 2),
      `${proc.command} ${proc.params}`
    );
  }

  generate(processes: CompletedProcess[]): string {
    const processInfos: string[] = [];
    processInfos.push(this.formatHeader());
    for (const proc of processes) {
      processInfos.push(this.formatDataRow(proc));
    }

    return processInfos.join("\n");
  }
}
