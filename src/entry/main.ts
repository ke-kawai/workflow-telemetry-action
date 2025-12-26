import * as stepTracer from "../features/step/stepTracer";
import * as statCollector from "../features/stats/collector";
import * as processTracer from "../features/process/processTracer";
import * as logger from "../utils/logger";

async function run(): Promise<void> {
  try {
    logger.info(`Initializing ...`);

    // Start tracers and collectors
    await stepTracer.start();
    await statCollector.start();
    await processTracer.start();

    logger.info(`Initialization completed`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
  }
}

run();
