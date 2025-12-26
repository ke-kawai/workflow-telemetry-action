import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as logger from './logger'

const execAsync = promisify(exec)

interface ProcessInfo {
  pid: number
  ppid: number
  uid: number
  name: string
  fileName: string
  args: string[]
  startTime: number
}

interface ProcessEvent {
  event: 'EXEC' | 'EXIT'
  ts: string
  name: string
  pid: number
  ppid?: number
  uid?: number
  startTime?: number
  fileName?: string
  args?: string[]
  duration?: number
  exitCode?: number
}

export class NativeProcessTracer {
  private running = false
  private outputFilePath: string
  private outputStream: fs.WriteStream | null = null
  private previousProcesses: Map<number, ProcessInfo> = new Map()
  private pollingInterval: NodeJS.Timeout | null = null
  private readonly POLL_INTERVAL_MS = 1000 // 1秒ごとにポーリング

  constructor(outputFilePath: string) {
    this.outputFilePath = outputFilePath
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.info('Native process tracer is already running')
      return
    }

    logger.info('Starting native process tracer...')

    try {
      // 出力ディレクトリを作成
      const outputDir = path.dirname(this.outputFilePath)
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // 出力ファイルを開く
      this.outputStream = fs.createWriteStream(this.outputFilePath, {
        flags: 'w'
      })

      this.running = true

      // 初回スナップショット
      await this.captureSnapshot()

      // 定期的にスナップショットを取得
      this.pollingInterval = setInterval(async () => {
        try {
          await this.captureSnapshot()
        } catch (error) {
          logger.error(`Error capturing process snapshot: ${error}`)
        }
      }, this.POLL_INTERVAL_MS)

      logger.info('Native process tracer started successfully')
    } catch (error) {
      logger.error(`Failed to start native process tracer: ${error}`)
      throw error
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.info('Native process tracer is not running')
      return
    }

    logger.info('Stopping native process tracer...')

    this.running = false

    // ポーリング停止
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    // 最終スナップショット - すべてのプロセスを終了として記録
    await this.finalizeAllProcesses()

    // 出力ストリームを閉じる
    if (this.outputStream) {
      this.outputStream.end()
      this.outputStream = null
    }

    logger.info('Native process tracer stopped')
  }

  private async captureSnapshot(): Promise<void> {
    const currentProcesses = await this.getProcessList()
    const currentPids = new Set(currentProcesses.keys())
    const previousPids = new Set(this.previousProcesses.keys())

    // 新しいプロセス（EXEC イベント）
    for (const [pid, info] of currentProcesses) {
      if (!previousPids.has(pid)) {
        this.writeEvent({
          event: 'EXEC',
          ts: new Date().toISOString(),
          name: info.name,
          pid: info.pid,
          ppid: info.ppid,
          uid: info.uid,
          startTime: info.startTime,
          fileName: info.fileName,
          args: info.args
        })
      }
    }

    // 終了したプロセス（EXIT イベント）
    for (const [pid, info] of this.previousProcesses) {
      if (!currentPids.has(pid)) {
        const duration = Date.now() - info.startTime
        this.writeEvent({
          event: 'EXIT',
          ts: new Date().toISOString(),
          name: info.name,
          pid: info.pid,
          duration,
          exitCode: 0 // 正確な終了コードは取得困難なため0とする
        })
      }
    }

    this.previousProcesses = currentProcesses
  }

  private async finalizeAllProcesses(): Promise<void> {
    // すべての追跡中プロセスを終了として記録
    for (const [pid, info] of this.previousProcesses) {
      const duration = Date.now() - info.startTime
      this.writeEvent({
        event: 'EXIT',
        ts: new Date().toISOString(),
        name: info.name,
        pid: info.pid,
        duration,
        exitCode: 0
      })
    }
    this.previousProcesses.clear()
  }

  private async getProcessList(): Promise<Map<number, ProcessInfo>> {
    try {
      // ps コマンドでプロセスリストを取得
      // フォーマット: PID,PPID,UID,COMM,COMMAND,LSTART
      const { stdout } = await execAsync(
        'ps -eo pid,ppid,uid,comm,args,lstart --no-headers',
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
      )

      const processes = new Map<number, ProcessInfo>()
      const lines = stdout.trim().split('\n')

      for (const line of lines) {
        const parsed = this.parseProcessLine(line)
        if (parsed) {
          processes.set(parsed.pid, parsed)
        }
      }

      return processes
    } catch (error) {
      logger.error(`Failed to get process list: ${error}`)
      return new Map()
    }
  }

  private parseProcessLine(line: string): ProcessInfo | null {
    try {
      // ps出力をパース
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) {
        return null
      }

      const pid = parseInt(parts[0], 10)
      const ppid = parseInt(parts[1], 10)
      const uid = parseInt(parts[2], 10)
      const comm = parts[3]

      // コマンドライン引数の部分を抽出
      // LSTART（開始時刻）の前まで
      const commandParts = []
      let commandEndIndex = 4
      for (let i = 4; i < parts.length; i++) {
        // LSTART の開始を検出（曜日名で始まる）
        if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(parts[i])) {
          commandEndIndex = i
          break
        }
        commandParts.push(parts[i])
      }

      const commandLine = commandParts.join(' ')
      const args = commandParts.length > 1 ? commandParts.slice(1) : []

      // 開始時刻をパース（lstartフィールド）
      let startTime = Date.now() // デフォルトは現在時刻
      if (commandEndIndex < parts.length) {
        const lstartParts = parts.slice(commandEndIndex)
        if (lstartParts.length >= 5) {
          try {
            // "Mon Dec 26 12:00:00 2025" 形式
            const lstartStr = lstartParts.join(' ')
            const date = new Date(lstartStr)
            if (!isNaN(date.getTime())) {
              startTime = date.getTime()
            }
          } catch (e) {
            // パース失敗時は現在時刻を使用
          }
        }
      }

      return {
        pid,
        ppid,
        uid,
        name: comm,
        fileName: commandParts[0] || comm,
        args,
        startTime
      }
    } catch (error) {
      logger.debug(`Failed to parse process line ${line}: ${error}`)
      return null
    }
  }

  private writeEvent(event: ProcessEvent): void {
    if (!this.outputStream) {
      return
    }

    try {
      const eventJson = JSON.stringify(event)
      this.outputStream.write(eventJson + '\n')

      if (logger.isDebugEnabled()) {
        logger.debug(`Process event: ${eventJson}`)
      }
    } catch (error) {
      logger.error(`Failed to write process event: ${error}`)
    }
  }
}
