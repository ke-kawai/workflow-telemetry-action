import { WorkflowJobType } from "../../interfaces";
import { Logger } from "../../utils/logger";
import { StepChartGenerator } from "./chartGenerator";
import { StepReportFormatter } from "./reportFormatter";

class StepTracer {
  constructor(
    private logger: Logger,
    private chartGenerator: StepChartGenerator,
    private reportFormatter: StepReportFormatter
  ) {}

  async start(): Promise<boolean> {
    this.logger.info(`Starting step tracer ...`);

    try {
      this.logger.info(`Started step tracer`);

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to start step tracer");

      return false;
    }
  }

  async finish(_currentJob: WorkflowJobType): Promise<boolean> {
    this.logger.info(`Finishing step tracer ...`);

    try {
      this.logger.info(`Finished step tracer`);

      return true;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to finish step tracer");

      return false;
    }
  }

  async report(currentJob: WorkflowJobType): Promise<string | null> {
    this.logger.info(`Reporting step tracer result ...`);

    if (!currentJob) {
      return null;
    }

    try {
      const chartContent = this.chartGenerator.generate(currentJob);
      const postContent = this.reportFormatter.format(chartContent);

      this.logger.info(`Reported step tracer result`);

      return postContent;
    } catch (error: unknown) {
      this.logger.error(error, "Unable to report step tracer result");

      return null;
    }
  }
}

const logger = new Logger();
const chartGenerator = new StepChartGenerator();
const reportFormatter = new StepReportFormatter();
const stepTracer = new StepTracer(logger, chartGenerator, reportFormatter);

export const start = () => stepTracer.start();
export const finish = (currentJob: WorkflowJobType) => stepTracer.finish(currentJob);
export const report = (currentJob: WorkflowJobType) => stepTracer.report(currentJob);
