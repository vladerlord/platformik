import { Kysely, PostgresDialect } from 'kysely'
import { uuidv7 } from 'uuidv7'
import type { WorkflowsDatabase } from '@platformik/module-workflows-ts/contracts'
import type { FlowDefinition } from '@platformik/module-workflows-ts/contracts'
import { createPinoLogger } from '@platformik/runtime-pino-ts'
import pg from 'pg'
import { ENV } from '../src/config'

const programmingLanguageFlow: FlowDefinition = {
  version: 'programming-language-v1',
  startNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', nextNodeId: 'ask-language' },
    {
      id: 'ask-language',
      type: 'option_selection',
      question: 'What is your favorite programming language?',
      answerKey: 'language',
      options: [
        { label: 'TypeScript', nextNodeId: 'send-summary' },
        { label: 'Python', nextNodeId: 'send-summary' },
        { label: 'Go', nextNodeId: 'send-summary' },
      ],
    },
    {
      id: 'send-summary',
      type: 'send_message',
      messageTemplate: 'Language: {language}',
      nextNodeId: 'end',
    },
    { id: 'end', type: 'end' },
  ],
}

const questionFlow: FlowDefinition = {
  version: 'question-flow-v2',
  startNodeId: 'start',
  nodes: [
    { id: 'start', type: 'start', nextNodeId: 'choose-action' },
    {
      id: 'choose-action',
      type: 'option_selection',
      question: 'What would you like to do?',
      answerKey: 'chosen_action',
      options: [
        { label: 'Show help', nextNodeId: 'send-help' },
        { label: 'Finish', nextNodeId: 'end' },
      ],
    },
    {
      id: 'send-help',
      type: 'send_message',
      messageTemplate: 'You selected: {chosen_action}',
      nextNodeId: 'choose-action',
    },
    { id: 'end', type: 'end' },
  ],
}

const logger = createPinoLogger({ level: 'info', name: 'service-workflows-seed' })

const pool = new pg.Pool({ connectionString: ENV.WORKFLOWS_DATABASE_URL })
const db = new Kysely<WorkflowsDatabase>({ dialect: new PostgresDialect({ pool }) })

const devUserId = '01970000-0000-7000-8000-000000000001'

await db
  .insertInto('workflows')
  .values([
    {
      id: uuidv7(),
      user_id: devUserId,
      title: 'Programming Language Survey',
      schema: JSON.stringify(programmingLanguageFlow),
    },
    {
      id: uuidv7(),
      user_id: devUserId,
      title: 'Interactive Q&A',
      schema: JSON.stringify(questionFlow),
    },
  ])
  .execute()

logger.info(`Seeded 2 workflows for user: ${devUserId}`)
await db.destroy()
