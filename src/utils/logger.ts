import * as core from "@actions/core";

const LOG_HEADER: string = "[Workflow Telemetry]";

export class Logger {
  isDebugEnabled(): boolean {
    return core.isDebug();
  }

  debug(msg: string): void {
    core.debug(LOG_HEADER + " " + msg);
  }

  info(msg: string): void {
    core.info(LOG_HEADER + " " + msg);
  }

  error(error: unknown, context?: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context) {
      core.error(`${LOG_HEADER} ${context}`);
    }
    core.error(`${LOG_HEADER} ${err.name}: ${err.message}`);
    core.error(err);
  }
}
