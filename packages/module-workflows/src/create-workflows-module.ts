import type { WorkflowsModule, WorkflowsModuleDeps } from './public/contracts/api'
import { createConversation } from './repository/conversations'
import {
  getPendingOutboxEntries,
  incrementOutboxAttempts,
  insertEventOutboxEntry,
  markOutboxEntryPublished,
} from './repository/event-outbox'
import { insertMessage } from './repository/messages'
import { insertNodeRun, updateNodeRun } from './repository/node-runs'
import { insertRunEvent } from './repository/run-events'
import {
  completeWorkflowRun,
  failWorkflowRun,
  getWorkflowRun,
  getWorkflowRunView,
  insertWorkflowRun,
  updateWorkflowRun,
} from './repository/workflow-runs'
import { getWorkflowSchema, listWorkflows } from './repository/workflows'

export const createWorkflowsModule = (deps: WorkflowsModuleDeps): WorkflowsModule => {
  const { db } = deps

  return {
    catalog: {
      list: (userId) => listWorkflows(db, userId),
      getSchema: (workflowId) => getWorkflowSchema(db, workflowId),
    },
    runs: {
      create: (params) => insertWorkflowRun(db, params),
      get: (runId) => getWorkflowRun(db, runId),
      update: (params) => updateWorkflowRun(db, params),
      complete: (runId, result) => completeWorkflowRun(db, runId, result),
      fail: (runId, errorMessage) => failWorkflowRun(db, runId, errorMessage),
      getView: (params) => getWorkflowRunView(db, params),
    },
    conversations: {
      create: (params) => createConversation(db, params),
    },
    messages: {
      create: (params) => insertMessage(db, params),
    },
    nodeRuns: {
      create: (params) => insertNodeRun(db, params),
      update: (params) => updateNodeRun(db, params),
    },
    events: {
      append: (params) => insertRunEvent(db, params),
    },
    outbox: {
      enqueue: (params) => insertEventOutboxEntry(db, params),
      listPending: (limit) => getPendingOutboxEntries(db, limit),
      markPublished: (id) => markOutboxEntryPublished(db, id),
      incrementAttempts: (id) => incrementOutboxAttempts(db, id),
    },
  }
}
