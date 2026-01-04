export interface MetricCharts {
  cpuLoad: string | null;
  memoryUsage: string | null;
  networkIORead: string | null;
  networkIOWrite: string | null;
  diskIORead: string | null;
  diskIOWrite: string | null;
  diskSizeUsage: string | null;
}

export class StatsReportFormatter {
  format(charts: MetricCharts): string {
    const postContentItems: string[] = [];

    if (charts.cpuLoad) {
      postContentItems.push("### CPU Metrics", charts.cpuLoad, "");
    }
    if (charts.memoryUsage) {
      postContentItems.push("### Memory Metrics", charts.memoryUsage, "");
    }
    if (
      (charts.networkIORead && charts.networkIOWrite) ||
      (charts.diskIORead && charts.diskIOWrite)
    ) {
      postContentItems.push(
        "### IO Metrics",
        "|               | Read      | Write     |",
        "|---            |---        |---        |"
      );
    }
    if (charts.networkIORead && charts.networkIOWrite) {
      postContentItems.push(
        `| Network I/O   | ${charts.networkIORead}        | ${charts.networkIOWrite}        |`
      );
    }
    if (charts.diskIORead && charts.diskIOWrite) {
      postContentItems.push(
        `| Disk I/O      | ${charts.diskIORead}              | ${charts.diskIOWrite}              |`
      );
    }
    if (charts.diskSizeUsage) {
      postContentItems.push("### Disk Size Metrics", charts.diskSizeUsage, "");
    }

    return postContentItems.join("\n");
  }
}
