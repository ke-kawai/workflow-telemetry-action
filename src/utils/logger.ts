import * as core from "@actions/core";

const LOG_HEADER: string = "[Workflow Telemetry]";

export function isDebugEnabled(): boolean {
  return core.isDebug();
}

export function debug(msg: string) {
  core.debug(LOG_HEADER + " " + msg);
}

export function info(msg: string) {
  core.info(LOG_HEADER + " " + msg);
}

export function error(error: Error, context?: string): void {
  if (context) {
    core.error(`${LOG_HEADER} ${context}`);
  }
  core.error(`${LOG_HEADER} ${error.name}: ${error.message}`);
  core.error(error);
}
