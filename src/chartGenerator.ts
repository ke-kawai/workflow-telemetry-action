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
 * Generate a line chart using QuickChart API
 * Time format matches Mermaid gantt chart (HH:mm:ss)
 */
export async function getLineGraph(
  options: LineGraphOptions
): Promise<GraphResponse> {
  const chartConfig = {
    type: 'line',
    data: {
      datasets: [
        {
          label: options.line.label,
          data: options.line.points,
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
            type: 'time',
            time: {
              displayFormats: {
                millisecond: 'HH:mm:ss',
                second: 'HH:mm:ss',
                minute: 'HH:mm:ss',
                hour: 'HH:mm'
              },
              unit: 'second'
            },
            scaleLabel: {
              display: true,
              labelString: 'Time',
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor
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
    backgroundColor: 'white',
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
 * Time format matches Mermaid gantt chart (HH:mm:ss)
 */
export async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<GraphResponse> {
  const datasets = options.areas.map((area, index) => ({
    label: area.label,
    data: area.points,
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
            type: 'time',
            time: {
              displayFormats: {
                millisecond: 'HH:mm:ss',
                second: 'HH:mm:ss',
                minute: 'HH:mm:ss',
                hour: 'HH:mm'
              },
              unit: 'second'
            },
            scaleLabel: {
              display: true,
              labelString: 'Time',
              fontColor: options.axisColor
            },
            ticks: {
              fontColor: options.axisColor
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
    backgroundColor: 'white',
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
