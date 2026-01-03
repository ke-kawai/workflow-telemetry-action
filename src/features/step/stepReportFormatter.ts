export class StepReportFormatter {
  format(chartContent: string): string {
    const postContentItems: string[] = [
      "",
      "### Step Trace",
      "",
      chartContent,
    ];
    return postContentItems.join("\n");
  }
}
