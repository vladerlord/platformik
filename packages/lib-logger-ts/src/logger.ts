export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LogMethod = (objOrMsg: object | string, msg?: string) => void

export interface Logger {
  level: string
  trace: LogMethod
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  fatal: LogMethod
  child(bindings: Record<string, unknown>): Logger
}
