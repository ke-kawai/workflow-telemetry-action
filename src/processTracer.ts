import path from 'path'
import * as core from '@actions/core'
import si from 'systeminformation'
import { sprintf } from 'sprintf-js'
import { parse } from './procTraceParser'
import { CompletedCommand, WorkflowJobType } from './interfaces'
import * as logger from './logger'
import { NativeProcessTracer } from './nativeProcessTracer'

const PROC_TRACER_STATE_KEY = 'PROC_TRACER_STARTED'
const PROC_TRACER_OUTPUT_FILE_NAME = 'proc-trace.out'
const DEFAULT_PROC_TRACE_CHART_MAX_COUNT = 100
const GHA_FILE_NAME_PREFIX = '/home/runner/work/_actions/'

let finished = false
let nativeTracer: NativeProcessTracer | null = null

async function isSupportedOS(): Promise<boolean> {
  const osInfo: si.Systeminformation.OsData = await si.osInfo()
  if (osInfo) {
    // Check whether we are running on Ubuntu (or Linux in general)
    if (osInfo.platform === 'linux') {
      logger.info(
        `Process tracing enabled on ${osInfo.distro} ${osInfo.release}`
      )
      return true
    }
  }

  logger.info(
    `Process tracing disabled because of unsupported OS: ${JSON.stringify(
      osInfo
    )}`
  )

  return false
}

function getExtraProcessInfo(command: CompletedCommand): string | null {
  // Check whether this is node process with args
  if (command.name === 'node' && command.args.length > 1) {
    const arg1: string = command.args[1]
    // Check whether this is Node.js GHA process
    if (arg1.startsWith(GHA_FILE_NAME_PREFIX)) {
      const actionFile: string = arg1.substring(GHA_FILE_NAME_PREFIX.length)
      const idx1: number = actionFile.indexOf('/')
      const idx2: number = actionFile.indexOf('/', idx1 + 1)
      if (idx1 >= 0 && idx2 > idx1) {
        // If we could find a valid GHA name, use it as extra info
        return actionFile.substring(idx1 + 1, idx2)
      }
    }
  }
  return null
}

///////////////////////////

export async function start(): Promise<boolean> {
  logger.info(`Starting process tracer ...`)

  try {
    const isSupported = await isSupportedOS()
    if (!isSupported) {
      return false
    }

    const procTraceOutFilePath = path.join(
      __dirname,
      '../proc-tracer',
      PROC_TRACER_OUTPUT_FILE_NAME
    )

    // Create native process tracer instance
    nativeTracer = new NativeProcessTracer(procTraceOutFilePath)
    await nativeTracer.start()

    core.saveState(PROC_TRACER_STATE_KEY, 'true')

    logger.info(`Started process tracer`)

    return true
  } catch (error: any) {
    logger.error('Unable to start process tracer')
    logger.error(error)

    return false
  }
}

export async function finish(currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing process tracer ...`)

  const isStarted: string = core.getState(PROC_TRACER_STATE_KEY)
  if (!isStarted || !nativeTracer) {
    logger.info(
      `Skipped finishing process tracer since process tracer didn't started`
    )
    return false
  }
  try {
    await nativeTracer.stop()
    finished = true

    logger.info(`Finished process tracer`)

    return true
  } catch (error: any) {
    logger.error('Unable to finish process tracer')
    logger.error(error)

    return false
  }
}

export async function report(
  currentJob: WorkflowJobType
): Promise<string | null> {
  logger.info(`Reporting process tracer result ...`)

  if (!finished) {
    logger.info(
      `Skipped reporting process tracer since process tracer didn't finished`
    )
    return null
  }
  try {
    const procTraceOutFilePath = path.join(
      __dirname,
      '../proc-tracer',
      PROC_TRACER_OUTPUT_FILE_NAME
    )

    logger.info(
      `Getting process tracer result from file ${procTraceOutFilePath} ...`
    )

    let procTraceMinDuration = -1
    const procTraceMinDurationInput: string = core.getInput(
      'proc_trace_min_duration'
    )
    if (procTraceMinDurationInput) {
      const minProcDurationVal: number = parseInt(procTraceMinDurationInput)
      if (Number.isInteger(minProcDurationVal)) {
        procTraceMinDuration = minProcDurationVal
      }
    }
    const procTraceSysEnable: boolean =
      core.getInput('proc_trace_sys_enable') === 'true'

    const procTraceChartShow: boolean =
      core.getInput('proc_trace_chart_show') === 'true'
    const procTraceChartMaxCountInput: number = parseInt(
      core.getInput('proc_trace_chart_max_count')
    )
    const procTraceChartMaxCount = Number.isInteger(procTraceChartMaxCountInput)
      ? procTraceChartMaxCountInput
      : DEFAULT_PROC_TRACE_CHART_MAX_COUNT
    const procTraceTableShow: boolean =
      core.getInput('proc_trace_table_show') === 'true'

    const completedCommands: CompletedCommand[] = await parse(
      procTraceOutFilePath,
      {
        minDuration: procTraceMinDuration,
        traceSystemProcesses: procTraceSysEnable
      }
    )

    ///////////////////////////////////////////////////////////////////////////

    let chartContent = ''

    if (procTraceChartShow) {
      chartContent = chartContent.concat('gantt', '\n')
      chartContent = chartContent.concat('\t', `title ${currentJob.name}`, '\n')
      chartContent = chartContent.concat('\t', `dateFormat x`, '\n')
      chartContent = chartContent.concat('\t', `axisFormat %H:%M:%S`, '\n')

      const filteredCommands: CompletedCommand[] = [...completedCommands]
        .sort((a: CompletedCommand, b: CompletedCommand) => {
          return -(a.duration - b.duration)
        })
        .slice(0, procTraceChartMaxCount)
        .sort((a: CompletedCommand, b: CompletedCommand) => {
          let result = a.startTime - b.startTime
          if (result === 0 && a.order && b.order) {
            result = a.order - b.order
          }
          return result
        })

      for (const command of filteredCommands) {
        const extraProcessInfo: string | null = getExtraProcessInfo(command)
        const escapedName = command.name.replace(/:/g, '#colon;')
        if (extraProcessInfo) {
          chartContent = chartContent.concat(
            '\t',
            `${escapedName} (${extraProcessInfo}) : `
          )
        } else {
          chartContent = chartContent.concat('\t', `${escapedName} : `)
        }
        if (command.exitCode !== 0) {
          // to show red
          chartContent = chartContent.concat('crit, ')
        }

        const startTime: number = command.startTime
        const finishTime: number = command.startTime + command.duration
        chartContent = chartContent.concat(
          `${Math.min(startTime, finishTime)}, ${finishTime}`,
          '\n'
        )
      }
    }

    ///////////////////////////////////////////////////////////////////////////

    let tableContent = ''

    if (procTraceTableShow) {
      const commandInfos: string[] = []
      commandInfos.push(
        sprintf(
          '%-12s %-16s %7s %7s %7s %15s %15s %10s %-20s',
          'TIME',
          'NAME',
          'UID',
          'PID',
          'PPID',
          'START TIME',
          'DURATION (ms)',
          'EXIT CODE',
          'FILE NAME + ARGS'
        )
      )
      for (const command of completedCommands) {
        commandInfos.push(
          sprintf(
            '%-12s %-16s %7d %7d %7d %15d %15d %10d %s %s',
            command.ts,
            command.name,
            command.uid,
            command.pid,
            command.ppid,
            command.startTime,
            command.duration,
            command.exitCode,
            command.fileName,
            command.args.join(' ')
          )
        )
      }

      tableContent = commandInfos.join('\n')
    }

    ///////////////////////////////////////////////////////////////////////////

    const postContentItems: string[] = ['', '### Process Trace']
    if (procTraceChartShow) {
      postContentItems.push(
        '',
        `#### Top ${procTraceChartMaxCount} processes with highest duration`,
        '',
        '```mermaid' + '\n' + chartContent + '\n' + '```'
      )
    }
    if (procTraceTableShow) {
      postContentItems.push(
        '',
        `#### All processes with detail`,
        '',
        '```' + '\n' + tableContent + '\n' + '```'
      )
    }

    const postContent: string = postContentItems.join('\n')

    logger.info(`Reported process tracer result`)

    return postContent
  } catch (error: any) {
    logger.error('Unable to report process tracer result')
    logger.error(error)

    return null
  }
}
