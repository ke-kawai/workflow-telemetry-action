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

  error(error: Error, context?: string): void {
    if (context) {
      core.error(`${LOG_HEADER} ${context}`);
    }
    core.error(`${LOG_HEADER} ${error.name}: ${error.message}`);
    core.error(error);
  }
}
