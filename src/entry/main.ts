import * as stepTracer from "../features/step/tracer";
import * as statCollector from "../features/stats/collector";
import * as processTracer from "../features/process/tracer";
import { Logger } from "../utils/logger";
import { loadMainConfig } from "../config/loader";

const logger = new Logger();

async function run(): Promise<void> {
  try {
    logger.info(`Initializing ...`);

    const config = loadMainConfig();

    // Start tracers and collectors
    await stepTracer.start();
    await statCollector.start(config.statsCollector);
    await processTracer.start(config.processTracer);

    logger.info(`Initialization completed`);
  } catch (error: unknown) {
    logger.error(error);
  }
}

run();
