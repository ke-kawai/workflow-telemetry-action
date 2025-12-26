import * as stepTracer from "../tracers/stepTracer";
import * as statCollector from "../collectors";
import * as processTracer from "../tracers/processTracer";
import * as logger from "../utils/logger";

async function run(): Promise<void> {
  try {
    logger.info(`Initializing ...`);

    // Start tracers and collectors
    await stepTracer.start();
    await statCollector.start();
    await processTracer.start();

    logger.info(`Initialization completed`);
  } catch (error: any) {
    logger.error(error.message);
  }
}

run();
