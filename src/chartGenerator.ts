import * as logger from "./logger";
import {
  GraphResponse,
  LineGraphOptions,
  StackedAreaGraphOptions,
} from "./interfaces";

/**
 * Chart Generator using QuickChart.io API
 * QuickChart.io is an open-source Chart.js service that can be self-hosted
 * Free tier: https://quickchart.io
 * GitHub: https://github.com/typpo/quickchart
 *
 * Based on PR #98: https://github.com/catchpoint/workflow-telemetry-action/pull/98
 */

const QUICKCHART_API_URL = "https://quickchart.io/chart/create";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const THEME_TO_CONFIG = {
  light: { axisColor: BLACK, backgroundColor: "white" },
  dark: { axisColor: WHITE, backgroundColor: "#0d1117" },
};

type Theme = keyof typeof THEME_TO_CONFIG;

function generatePictureHTML(
  themeToURLMap: Map<Theme, string>,
  label: string
): string {
  const sources = Array.from(themeToURLMap.entries())
    .map(
      ([theme, url]) =>
        `<source media="(prefers-color-scheme: ${theme})" srcset="${url}">`
    )
    .join("");
  const fallbackUrl = themeToURLMap.get("light") || "";
  return `<picture>${sources}<img alt="${label}" src="${fallbackUrl}"></picture>`;
}

/**
 * Generate a line chart using QuickChart API
 * Time format matches Mermaid gantt chart (HH:mm:ss)
 */
export async function getLineGraph(options: LineGraphOptions): Promise<string> {
  const themeToURLMap = new Map<Theme, string>();

  await Promise.all(
    (Object.keys(THEME_TO_CONFIG) as Theme[]).map(async (theme) => {
      const config = THEME_TO_CONFIG[theme];
      const chartConfig = {
        type: "line",
        data: {
          datasets: [
            {
              label: options.line.label,
              data: options.line.points,
              borderColor: options.line.color,
              backgroundColor: options.line.color + "33",
              fill: false,
              tension: 0.1,
            },
          ],
        },
        options: {
          scales: {
            xAxes: [
              {
                type: "time",
                time: {
                  displayFormats: {
                    millisecond: "HH:mm:ss",
                    second: "HH:mm:ss",
                    minute: "HH:mm:ss",
                    hour: "HH:mm",
                  },
                  unit: "second",
                },
                scaleLabel: {
                  display: true,
                  labelString: "Time",
                  fontColor: config.axisColor,
                },
                ticks: {
                  fontColor: config.axisColor,
                },
              },
            ],
            yAxes: [
              {
                scaleLabel: {
                  display: true,
                  labelString: options.label,
                  fontColor: config.axisColor,
                },
                ticks: {
                  fontColor: config.axisColor,
                  beginAtZero: true,
                },
              },
            ],
          },
          legend: {
            labels: {
              fontColor: config.axisColor,
            },
          },
        },
      };

      const payload = {
        width: 800,
        height: 400,
        backgroundColor: config.backgroundColor,
        chart: chartConfig,
      };

      try {
        const response = await fetch(QUICKCHART_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data: GraphResponse = await response.json();
        if (data?.success && data?.url) {
          themeToURLMap.set(theme, data.url);
        }
      } catch (error: any) {
        logger.error(error);
        logger.error(`getLineGraph ${theme} ${JSON.stringify(payload)}`);
      }
    })
  );

  return generatePictureHTML(themeToURLMap, options.label);
}

/**
 * Generate a stacked area chart using QuickChart API
 * Time format matches Mermaid gantt chart (HH:mm:ss)
 */
export async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<string> {
  const themeToURLMap = new Map<Theme, string>();

  await Promise.all(
    (Object.keys(THEME_TO_CONFIG) as Theme[]).map(async (theme) => {
      const config = THEME_TO_CONFIG[theme];
      const datasets = options.areas.map((area, index) => ({
        label: area.label,
        data: area.points,
        borderColor: area.color,
        backgroundColor: area.color,
        fill: index === 0 ? "origin" : "-1",
        tension: 0.1,
      }));

      const chartConfig = {
        type: "line",
        data: {
          datasets,
        },
        options: {
          scales: {
            xAxes: [
              {
                type: "time",
                time: {
                  displayFormats: {
                    millisecond: "HH:mm:ss",
                    second: "HH:mm:ss",
                    minute: "HH:mm:ss",
                    hour: "HH:mm",
                  },
                  unit: "second",
                },
                scaleLabel: {
                  display: true,
                  labelString: "Time",
                  fontColor: config.axisColor,
                },
                ticks: {
                  fontColor: config.axisColor,
                },
              },
            ],
            yAxes: [
              {
                stacked: true,
                scaleLabel: {
                  display: true,
                  labelString: options.label,
                  fontColor: config.axisColor,
                },
                ticks: {
                  fontColor: config.axisColor,
                  beginAtZero: true,
                },
              },
            ],
          },
          legend: {
            labels: {
              fontColor: config.axisColor,
            },
          },
        },
      };

      const payload = {
        width: 800,
        height: 400,
        backgroundColor: config.backgroundColor,
        chart: chartConfig,
      };

      try {
        const response = await fetch(QUICKCHART_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data: GraphResponse = await response.json();
        if (data?.success && data?.url) {
          themeToURLMap.set(theme, data.url);
        }
      } catch (error: any) {
        logger.error(error);
        logger.error(`getStackedAreaGraph ${theme} ${JSON.stringify(payload)}`);
      }
    })
  );

  return generatePictureHTML(themeToURLMap, options.label);
}
