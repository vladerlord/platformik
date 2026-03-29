export type LoginResponse = {
  sessionToken: string
}

export type WorkflowSummary = {
  id?: { value: string }
  title: string
}

export type ListWorkflowsResponse = {
  workflows: WorkflowSummary[]
}

export type StartWorkflowResponse = {
  workflowRunId: string
  conversationId: string
  temporalWorkflowId: string
}

export type ConversationMessage = {
  id?: { value: string }
  conversationId?: { value: string }
  runId?: { value: string }
  role: string
  content?: Record<string, unknown>
}

export type OptionInput = {
  label: string
  options: Array<{ id: string; label: string }>
}

export type PendingInput = {
  optionInput?: OptionInput
}

export type WorkflowRunViewResponse = {
  conversationId: string | null
  status: string
  currentNodeId: string | null
  revision: number
  lastMessageId: string | null
  messages: ConversationMessage[]
  pendingInput: PendingInput | null
}

export type SseEvent = {
  event: string
  data: string
}

export type ApiError = {
  error: { code: string; message: string }
}

export class BffClient {
  private token: string | undefined

  constructor(private baseUrl: string) {}

  setToken(token: string): void {
    this.token = token
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`
    }

    return headers
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiError
      throw new Error(body.error?.message ?? `Login failed: ${response.status}`)
    }

    return (await response.json()) as LoginResponse
  }

  async listWorkflows(): Promise<ListWorkflowsResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/workflows`, {
      headers: this.headers(),
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiError
      throw new Error(body.error?.message ?? `List workflows failed: ${response.status}`)
    }

    return (await response.json()) as ListWorkflowsResponse
  }

  async startWorkflow(workflowId: string): Promise<StartWorkflowResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/workflows/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ workflowId }),
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiError
      throw new Error(body.error?.message ?? `Start workflow failed: ${response.status}`)
    }

    return (await response.json()) as StartWorkflowResponse
  }

  async getWorkflowRunView(runId: string, afterId?: string): Promise<WorkflowRunViewResponse> {
    const params = afterId ? `?afterId=${encodeURIComponent(afterId)}` : ''
    const response = await fetch(`${this.baseUrl}/api/v1/workflows/runs/${runId}${params}`, {
      headers: this.headers(),
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiError
      throw new Error(body.error?.message ?? `Get run view failed: ${response.status}`)
    }

    return (await response.json()) as WorkflowRunViewResponse
  }

  async submitAnswer(runId: string, optionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/workflows/runs/${runId}/answer`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ optionId }),
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiError
      throw new Error(body.error?.message ?? `Submit answer failed: ${response.status}`)
    }
  }

  subscribeToRun(
    runId: string,
    afterId: string | undefined,
    onEvent: (event: SseEvent) => void,
    onError: (error: Error) => void,
  ): { close: () => void } {
    let aborted = false
    const controller = new AbortController()

    const connect = async () => {
      const params = afterId ? `?afterId=${encodeURIComponent(afterId)}` : ''

      while (!aborted) {
        try {
          const response = await fetch(`${this.baseUrl}/api/v1/workflows/runs/${runId}/events${params}`, {
            headers: {
              ...this.headers(),
              accept: 'text/event-stream',
            },
            signal: controller.signal,
          })

          if (!response.ok || !response.body) {
            throw new Error(`SSE connection failed: ${response.status}`)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (!aborted) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            let currentEvent = ''
            let currentData = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7)
              } else if (line.startsWith('data: ')) {
                currentData = line.slice(6)
              } else if (line === '' && currentEvent) {
                onEvent({ event: currentEvent, data: currentData })
                currentEvent = ''
                currentData = ''
              }
            }
          }
        } catch (error) {
          if (aborted) break
          onError(error instanceof Error ? error : new Error(String(error)))
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    }

    void connect()

    return {
      close: () => {
        aborted = true
        controller.abort()
      },
    }
  }
}
