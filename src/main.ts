import * as stepTracer from "./stepTracer";
import * as statCollector from "./statCollector";
import * as processTracer from "./processTracer";
import * as logger from "./logger";

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
