import { Logger } from "../../utils/logger";
import {
  GraphResponse,
  LineGraphOptions,
  StackedAreaGraphOptions,
} from "./types";

const logger = new Logger();

/**
 * Chart Generator using QuickChart.io API
 * QuickChart.io is an open-source Chart.js service that can be self-hosted
 * Free tier: https://quickchart.io
 * GitHub: https://github.com/typpo/quickchart
 */

const QUICKCHART_API_URL = "https://quickchart.io/chart/create";
const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;

const THEMES = [
  { name: "light", axisColor: "#000000", backgroundColor: "white" },
  { name: "dark", axisColor: "#FFFFFF", backgroundColor: "#0d1117" },
] as const;

type Theme = typeof THEMES[number]["name"];

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

///////////////////////////

// Common chart configuration helpers
///////////////////////////

function createTimeScaleConfig(theme: typeof THEMES[number]) {
  return {
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
      fontColor: theme.axisColor,
    },
    ticks: {
      fontColor: theme.axisColor,
    },
  };
}

function createYAxisConfig(
  theme: typeof THEMES[number],
  label: string,
  stacked: boolean = false
) {
  return {
    stacked,
    scaleLabel: {
      display: true,
      labelString: label,
      fontColor: theme.axisColor,
    },
    ticks: {
      fontColor: theme.axisColor,
      beginAtZero: true,
    },
  };
}

function createLegendConfig(theme: typeof THEMES[number]) {
  return {
    labels: {
      fontColor: theme.axisColor,
    },
  };
}

async function createChartFromConfig(
  theme: typeof THEMES[number],
  chartConfig: any,
  errorLabel: string
): Promise<string | null> {
  const payload = {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColor: theme.backgroundColor,
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
      return data.url;
    }
  } catch (error: unknown) {
    logger.error(error, `${errorLabel} ${theme.name} ${JSON.stringify(payload)}`);
  }
  return null;
}

///////////////////////////

/**
 * Generate a line chart using QuickChart API
 * Time format matches Mermaid gantt chart (HH:mm:ss)
 */
export async function getLineGraph(options: LineGraphOptions): Promise<string> {
  const themeToURLMap = new Map<Theme, string>();

  await Promise.all(
    THEMES.map(async (theme) => {
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
            xAxes: [createTimeScaleConfig(theme)],
            yAxes: [createYAxisConfig(theme, options.label)],
          },
          legend: createLegendConfig(theme),
        },
      };

      const url = await createChartFromConfig(
        theme,
        chartConfig,
        "getLineGraph"
      );
      if (url) {
        themeToURLMap.set(theme.name, url);
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
    THEMES.map(async (theme) => {
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
            xAxes: [createTimeScaleConfig(theme)],
            yAxes: [createYAxisConfig(theme, options.label, true)],
          },
          legend: createLegendConfig(theme),
        },
      };

      const url = await createChartFromConfig(
        theme,
        chartConfig,
        "getStackedAreaGraph"
      );
      if (url) {
        themeToURLMap.set(theme.name, url);
      }
    })
  );

  return generatePictureHTML(themeToURLMap, options.label);
}
