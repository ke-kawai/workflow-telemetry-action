import { WorkflowJobType } from "../../interfaces";

type Step = NonNullable<WorkflowJobType["steps"]>[number];

export class StepChartGenerator {
  private generateGanttHeader(jobName: string): string {
    const lines = [
      "gantt",
      `\ttitle ${jobName}`,
      `\tdateFormat x`,
      `\taxisFormat %H:%M:%S`,
    ];
    return lines.join("\n") + "\n";
  }

  private generateStepLine(step: Step): string {
    if (!step.started_at || !step.completed_at) {
      return "";
    }

    const parts: string[] = [`\t${step.name.replace(/:/g, "-")} : `];

    if (step.name === "Set up job" && step.number === 1) {
      parts.push("milestone, ");
    }

    if (step.conclusion === "failure") {
      // to show red
      parts.push("crit, ");
    } else if (step.conclusion === "skipped") {
      // to show grey
      parts.push("done, ");
    }

    const startTime: number = new Date(step.started_at).getTime();
    const finishTime: number = new Date(step.completed_at).getTime();
    parts.push(`${startTime}, ${finishTime}`, "\n");

    return parts.join("");
  }

  private generateMermaidContent(job: WorkflowJobType): string {
    const header = this.generateGanttHeader(job.name);
    const stepLines = (job.steps || []).map(step => this.generateStepLine(step)).join("");

    return header + stepLines;
  }

  generate(job: WorkflowJobType): string {
    const mermaidContent = this.generateMermaidContent(job);
    return "```mermaid\n" + mermaidContent + "```";
  }
}
