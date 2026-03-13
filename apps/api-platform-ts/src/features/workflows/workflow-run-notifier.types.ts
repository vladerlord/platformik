export type RunWaiter = {
  afterVersion: number
  resolve: (version: number | null) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export type WorkflowRunNotifier = {
  isReady(): boolean
  getRunVersion(runId: string): number
  waitForRunTrigger(runId: string, afterVersion: number, timeoutMs: number): Promise<number | null>
  close(): Promise<void>
}
