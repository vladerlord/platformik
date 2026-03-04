import pino from 'pino'
import type { Logger, LogLevel } from '@platformik/lib-logger-ts'

export type PinoLoggerConfig = {
  level?: LogLevel
  name?: string
}

export const createPinoLogger = (config?: PinoLoggerConfig): Logger => {
  const options: pino.LoggerOptions = { level: config?.level ?? 'info' }

  if (config?.name !== undefined) {
    options.name = config.name
  }

  return pino(options)
}
