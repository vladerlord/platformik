import { hashPassword } from 'better-auth/crypto'
import { Kysely, PostgresDialect } from 'kysely'
import type { IamDatabase } from '@platformik/module-iam/contracts'
import type { FlowDefinition, WorkflowsDatabase } from '@platformik/module-workflows/contracts'
import { createPinoLogger } from '@platformik/lib-logger'
import { uuidv7 } from 'uuidv7'
import z from 'zod'
import { loadDatabaseEnv, nodeEnvSchema } from '../src/config/env'
import { createPgPool } from '../src/ops/pg/pg'

const DEV_USER_ID = '01970000-0000-7000-8000-000000000001'

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

const ENV = {
  ...loadDatabaseEnv(process.env),
  ...z
    .object({
      NODE_ENV: nodeEnvSchema.default('development'),
      DEV_SEED_PASSWORD: z.string().min(1).default('dev-password-123'),
    })
    .parse(process.env),
}

const logger = createPinoLogger({ level: 'info', name: 'api-platform-seed' })

const iamDb = new Kysely<IamDatabase>({
  dialect: new PostgresDialect({ pool: createPgPool(ENV.IAM_DATABASE_URL) }),
})

const workflowsDb = new Kysely<WorkflowsDatabase>({
  dialect: new PostgresDialect({ pool: createPgPool(ENV.WORKFLOWS_DATABASE_URL) }),
})

const now = new Date()

const devUser = {
  id: DEV_USER_ID,
  name: 'Dev User',
  email: 'dev@platformik.local',
  emailVerified: true,
  image: null,
  createdAt: now,
  updatedAt: now,
}

const devAccount = {
  id: uuidv7(),
  userId: DEV_USER_ID,
  accountId: DEV_USER_ID,
  providerId: 'credential',
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  scope: null,
  password: await hashPassword(ENV.DEV_SEED_PASSWORD),
  createdAt: now,
  updatedAt: now,
}

const ensureWorkflowSeeded = async (
  title: string,
  definition: FlowDefinition,
): Promise<'inserted' | 'existing'> => {
  const existing = await workflowsDb
    .selectFrom('workflows')
    .select('id')
    .where('user_id', '=', DEV_USER_ID)
    .where('title', '=', title)
    .executeTakeFirst()

  if (existing) {
    return 'existing'
  }

  await workflowsDb
    .insertInto('workflows')
    .values({
      id: uuidv7(),
      user_id: DEV_USER_ID,
      title,
      schema: JSON.stringify(definition),
    })
    .execute()

  return 'inserted'
}

try {
  await iamDb
    .insertInto('user')
    .values(devUser)
    .onConflict((oc) => oc.column('email').doNothing())
    .execute()

  await iamDb
    .insertInto('account')
    .values(devAccount)
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  const programmingLanguageStatus = await ensureWorkflowSeeded(
    'Programming Language Survey',
    programmingLanguageFlow,
  )
  const questionFlowStatus = await ensureWorkflowSeeded('Interactive Q&A', questionFlow)

  logger.info({ email: devUser.email }, 'Seeded dev IAM account')
  logger.info(
    {
      programmingLanguageSurvey: programmingLanguageStatus,
      interactiveQA: questionFlowStatus,
      userId: DEV_USER_ID,
    },
    'Seeded workflows catalog',
  )
} finally {
  await workflowsDb.destroy()
  await iamDb.destroy()
}
