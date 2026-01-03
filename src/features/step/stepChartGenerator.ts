import { WorkflowJobType } from "../../interfaces";

export class StepChartGenerator {
  private generateMermaidContent(job: WorkflowJobType): string {
    let mermaidContent = "";

    /**
       gantt
         title Build
         dateFormat x
         axisFormat %H:%M:%S
         Set up job : milestone, 1658073446000, 1658073450000
         Collect Workflow Telemetry : 1658073450000, 1658073450000
         Run actions/checkout@v2 : 1658073451000, 1658073453000
         Set up JDK 8 : 1658073453000, 1658073458000
         Build with Maven : 1658073459000, 1658073654000
         Run invalid command : crit, 1658073655000, 1658073654000
         Archive test results : done, 1658073655000, 1658073654000
         Post Set up JDK 8 : 1658073655000, 1658073654000
         Post Run actions/checkout@v2 : 1658073655000, 1658073655000
    */

    mermaidContent = mermaidContent.concat("gantt", "\n");
    mermaidContent = mermaidContent.concat("\t", `title ${job.name}`, "\n");
    mermaidContent = mermaidContent.concat("\t", `dateFormat x`, "\n");
    mermaidContent = mermaidContent.concat("\t", `axisFormat %H:%M:%S`, "\n");

    for (const step of job.steps || []) {
      if (!step.started_at || !step.completed_at) {
        continue;
      }
      mermaidContent = mermaidContent.concat(
        "\t",
        `${step.name.replace(/:/g, "-")} : `
      );

      if (step.name === "Set up job" && step.number === 1) {
        mermaidContent = mermaidContent.concat("milestone, ");
      }

      if (step.conclusion === "failure") {
        // to show red
        mermaidContent = mermaidContent.concat("crit, ");
      } else if (step.conclusion === "skipped") {
        // to show grey
        mermaidContent = mermaidContent.concat("done, ");
      }

      const startTime: number = new Date(step.started_at).getTime();
      const finishTime: number = new Date(step.completed_at).getTime();
      mermaidContent = mermaidContent.concat(
        `${startTime}, ${finishTime}`,
        "\n"
      );
    }

    return mermaidContent;
  }

  generate(job: WorkflowJobType): string {
    const mermaidContent = this.generateMermaidContent(job);
    return "```mermaid\n" + mermaidContent + "```";
  }
}
