import type { WorkflowsModule, WorkflowsModuleDeps } from './contracts'
import { createConversation } from './repository/conversations'
import {
  insertEventOutboxEntry,
  getPendingOutboxEntries,
  markOutboxEntryPublished,
  incrementOutboxAttempts,
} from './repository/event-outbox'
import { insertMessage } from './repository/messages'
import { insertNodeRun, updateNodeRun } from './repository/node-runs'
import { insertRunEvent } from './repository/run-events'
import {
  getWorkflowRunView,
  insertWorkflowRun,
  getWorkflowRun,
  updateWorkflowRun,
  completeWorkflowRun,
} from './repository/workflow-runs'
import { listWorkflows, getWorkflowSchema } from './repository/workflows'

export const createWorkflowsModule = (deps: WorkflowsModuleDeps): WorkflowsModule => {
  const { db } = deps

  return {
    listWorkflows: (userId) => listWorkflows(db, userId),
    getWorkflowSchema: (workflowId) => getWorkflowSchema(db, workflowId),
    insertWorkflowRun: (params) => insertWorkflowRun(db, params),
    getWorkflowRun: (runId) => getWorkflowRun(db, runId),
    updateWorkflowRun: (params) => updateWorkflowRun(db, params),
    completeWorkflowRun: (runId, result) => completeWorkflowRun(db, runId, result),
    createConversation: (params) => createConversation(db, params),
    insertMessage: (params) => insertMessage(db, params),
    insertNodeRun: (params) => insertNodeRun(db, params),
    updateNodeRun: (params) => updateNodeRun(db, params),
    insertRunEvent: (params) => insertRunEvent(db, params),
    insertEventOutboxEntry: (params) => insertEventOutboxEntry(db, params),
    getWorkflowRunView: (params) => getWorkflowRunView(db, params),
    getPendingOutboxEntries: (limit) => getPendingOutboxEntries(db, limit),
    markOutboxEntryPublished: (id) => markOutboxEntryPublished(db, id),
    incrementOutboxAttempts: (id) => incrementOutboxAttempts(db, id),
  }
}

export { workflowsMigrations } from './migrations'
