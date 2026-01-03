import { WorkflowJobType } from "../../interfaces";

type Step = NonNullable<WorkflowJobType["steps"]>[number];

export class StepChartGenerator {
  private generateGanttHeader(jobName: string): string {
    let header = "";
    header = header.concat("gantt", "\n");
    header = header.concat("\t", `title ${jobName}`, "\n");
    header = header.concat("\t", `dateFormat x`, "\n");
    header = header.concat("\t", `axisFormat %H:%M:%S`, "\n");
    return header;
  }

  private generateStepLine(step: Step): string {
    if (!step.started_at || !step.completed_at) {
      return "";
    }

    let line = "";
    line = line.concat("\t", `${step.name.replace(/:/g, "-")} : `);

    if (step.name === "Set up job" && step.number === 1) {
      line = line.concat("milestone, ");
    }

    if (step.conclusion === "failure") {
      // to show red
      line = line.concat("crit, ");
    } else if (step.conclusion === "skipped") {
      // to show grey
      line = line.concat("done, ");
    }

    const startTime: number = new Date(step.started_at).getTime();
    const finishTime: number = new Date(step.completed_at).getTime();
    line = line.concat(`${startTime}, ${finishTime}`, "\n");

    return line;
  }

  private generateMermaidContent(job: WorkflowJobType): string {
    let mermaidContent = this.generateGanttHeader(job.name);

    for (const step of job.steps || []) {
      mermaidContent = mermaidContent.concat(this.generateStepLine(step));
    }

    return mermaidContent;
  }

  generate(job: WorkflowJobType): string {
    const mermaidContent = this.generateMermaidContent(job);
    return "```mermaid\n" + mermaidContent + "```";
  }
}
