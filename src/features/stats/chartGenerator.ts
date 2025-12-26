import * as logger from "../../utils/logger";
import {
  GraphResponse,
  LineGraphOptions,
  StackedAreaGraphOptions,
} from "../../interfaces";
import { QUICKCHART, THEME } from "../../constants";

/**
 * Chart Generator using QuickChart.io API
 * QuickChart.io is an open-source Chart.js service that can be self-hosted
 * Free tier: https://quickchart.io
 * GitHub: https://github.com/typpo/quickchart
 */

const THEME_TO_CONFIG = {
  light: {
    axisColor: THEME.LIGHT.AXIS_COLOR,
    backgroundColor: THEME.LIGHT.BACKGROUND_COLOR,
  },
  dark: {
    axisColor: THEME.DARK.AXIS_COLOR,
    backgroundColor: THEME.DARK.BACKGROUND_COLOR,
  },
};

type Theme = keyof typeof THEME_TO_CONFIG;

interface ThemeConfig {
  axisColor: string;
  backgroundColor: string;
}

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

function createTimeScaleConfig(config: ThemeConfig) {
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
      fontColor: config.axisColor,
    },
    ticks: {
      fontColor: config.axisColor,
    },
  };
}

function createYAxisConfig(
  config: ThemeConfig,
  label: string,
  stacked: boolean = false
) {
  return {
    stacked,
    scaleLabel: {
      display: true,
      labelString: label,
      fontColor: config.axisColor,
    },
    ticks: {
      fontColor: config.axisColor,
      beginAtZero: true,
    },
  };
}

function createLegendConfig(config: ThemeConfig) {
  return {
    labels: {
      fontColor: config.axisColor,
    },
  };
}

async function createChartFromConfig(
  theme: Theme,
  config: ThemeConfig,
  chartConfig: any,
  errorLabel: string
): Promise<string | null> {
  const payload = {
    width: QUICKCHART.CHART_WIDTH,
    height: QUICKCHART.CHART_HEIGHT,
    backgroundColor: config.backgroundColor,
    chart: chartConfig,
  };

  try {
    const response = await fetch(QUICKCHART.API_URL, {
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
  } catch (error: any) {
    logger.error(error);
    logger.error(`${errorLabel} ${theme} ${JSON.stringify(payload)}`);
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
            xAxes: [createTimeScaleConfig(config)],
            yAxes: [createYAxisConfig(config, options.label)],
          },
          legend: createLegendConfig(config),
        },
      };

      const url = await createChartFromConfig(
        theme,
        config,
        chartConfig,
        "getLineGraph"
      );
      if (url) {
        themeToURLMap.set(theme, url);
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
            xAxes: [createTimeScaleConfig(config)],
            yAxes: [createYAxisConfig(config, options.label, true)],
          },
          legend: createLegendConfig(config),
        },
      };

      const url = await createChartFromConfig(
        theme,
        config,
        chartConfig,
        "getStackedAreaGraph"
      );
      if (url) {
        themeToURLMap.set(theme, url);
      }
    })
  );

  return generatePictureHTML(themeToURLMap, options.label);
}
