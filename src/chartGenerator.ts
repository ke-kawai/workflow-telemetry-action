import axios from 'axios'
import * as logger from './logger'
import {
  GraphResponse,
  LineGraphOptions,
  StackedAreaGraphOptions
} from './interfaces'

/**
 * Chart Generator using QuickChart.io API
 * QuickChart.io is an open-source Chart.js service that can be self-hosted
 * Free tier: https://quickchart.io
 * GitHub: https://github.com/typpo/quickchart
 *
 * Based on PR #98: https://github.com/catchpoint/workflow-telemetry-action/pull/98
 */

const QUICKCHART_API_URL = 'https://quickchart.io/chart/create'

/**
 * Convert timestamp-based points to relative seconds from start
 */
function convertToRelativeTime(
  points: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (points.length === 0) return points

  const startTime = points[0].x
  return points.map(p => ({
    x: (p.x - startTime) / 1000, // Convert to seconds from start
    y: p.y
  }))
}

/**
 * Generate a line chart using QuickChart API
 */
export async function getLineGraph(
  options: LineGraphOptions
): Promise<GraphResponse> {
  // Convert timestamps to relative seconds
  const relativePoints = convertToRelativeTime(options.line.points)

  const chartConfig = {
    type: 'line',
    data: {
      datasets: [
        {
          label: options.line.label,
          data: relativePoints,
          borderColor: options.line.color,
          backgroundColor: options.line.color + '33',
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      scales: {
        xAxes: [
          {
            type: 'linear',
            scaleLabel: {
              display: true,
              labelString: 'Time (s)',
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor,
              callback: (value: number) => `${value}s`
            }
          }
        ],
        yAxes: [
          {
            scaleLabel: {
              display: true,
              labelString: options.label,
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor,
              beginAtZero: true
            }
          }
        ]
      },
      legend: {
        labels: {
          fontColor: options.axisColor
        }
      }
    }
  }

  const payload = {
    width: 800,
    height: 400,
    chart: chartConfig
  }

  let response = null
  try {
    response = await axios.post(QUICKCHART_API_URL, payload)
  } catch (error: any) {
    logger.error(error)
    logger.error(`getLineGraph ${JSON.stringify(payload)}`)
  }

  if (response?.data?.success && response?.data?.url) {
    const urlParts = response.data.url.split('/')
    const id = urlParts[urlParts.length - 1] || 'line-chart'
    return { id, url: response.data.url }
  }

  return response?.data
}

/**
 * Generate a stacked area chart using QuickChart API
 */
export async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<GraphResponse> {
  // Convert all area datasets to relative time
  const datasets = options.areas.map((area, index) => ({
    label: area.label,
    data: convertToRelativeTime(area.points),
    borderColor: area.color,
    backgroundColor: area.color,
    fill: index === 0 ? 'origin' : '-1',
    tension: 0.1
  }))

  const chartConfig = {
    type: 'line',
    data: {
      datasets
    },
    options: {
      scales: {
        xAxes: [
          {
            type: 'linear',
            scaleLabel: {
              display: true,
              labelString: 'Time (s)',
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor,
              callback: (value: number) => `${value}s`
            }
          }
        ],
        yAxes: [
          {
            stacked: true,
            scaleLabel: {
              display: true,
              labelString: options.label,
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor,
              beginAtZero: true
            }
          }
        ]
      },
      legend: {
        labels: {
          fontColor: options.axisColor
        }
      }
    }
  }

  const payload = {
    width: 800,
    height: 400,
    chart: chartConfig
  }

  let response = null
  try {
    response = await axios.post(QUICKCHART_API_URL, payload)
  } catch (error: any) {
    logger.error(error)
    logger.error(`getStackedAreaGraph ${JSON.stringify(payload)}`)
  }

  if (response?.data?.success && response?.data?.url) {
    const urlParts = response.data.url.split('/')
    const id = urlParts[urlParts.length - 1] || 'stacked-area-chart'
    return { id, url: response.data.url }
  }

  return response?.data
}
