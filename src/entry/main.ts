import * as stepTracer from "../features/step/stepTracer";
import * as statCollector from "../features/stats/collector";
import * as processTracer from "../features/process/processTracer";
import { Logger } from "../utils/logger";

const logger = new Logger();

async function run(): Promise<void> {
  try {
    logger.info(`Initializing ...`);

    // Start tracers and collectors
    await stepTracer.start();
    await statCollector.start();
    await processTracer.start();

    logger.info(`Initialization completed`);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(err);
  }
}

run();
