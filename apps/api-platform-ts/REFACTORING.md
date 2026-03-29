# Refactoring Backlog for `apps/api-platform-ts`

## Scope

Аудит покриває весь `apps/api-platform-ts` (entrypoints, container, API routes, ops/helpers, workflow
notifier, tests).

## Priorities

- `P0` — може спричинити неправильну поведінку API або ускладнює еволюцію контракту.
- `P1` — суттєво спрощує код і знижує ризик регресій.
- `P2` — покращення підтримуваності/консистентності.

## Findings

### 1) `workflows.ts` порушує single responsibility

- Priority: `P1`
- Files:
  - `src/api/v1/workflows.ts:101-199`
  - `src/api/v1/workflows.ts:201-566`
- Problem:
  - В одному файлі змішані: HTTP transport, auth adapter, gRPC mapping, SSE delta logic, stream loop/state.
  - Це вже суперечить цільовій структурі з `apps/api-platform-ts/AGENTS.md` (`*.types.ts` для type layer і
    `src/application/` для app-local orchestration). Поточний код усе ще в перехідному стані
    `src/features/ -> src/application/`.
- Refactor:
  - Винести `zod` схеми + типи в `src/api/v1/workflows.types.ts`.
  - У межах міграції на нову архітектуру винести SSE orchestration (`mapRunViewToSseDeltas`,
    `streamWorkflowEvents`) у `src/application/workflows/`.
  - У route-файлі залишити лише parsing/validation/response mapping.
- Fast validation:
  - Додати тести на SSE delta mapping без Fastify (pure unit).

### 2) Повторення auth-гейту у всіх workflow endpoints

- Priority: `P1`
- Files:
  - `src/api/v1/workflows.ts:223-228`
  - `src/api/v1/workflows.ts:262-267`
  - `src/api/v1/workflows.ts:314-319`
  - `src/api/v1/workflows.ts:375-380`
  - `src/api/v1/workflows.ts:437-442`
- Problem:
  - Одна й та сама логіка `resolveSessionUser -> mapAuthError -> reply` копіпаститься 5 разів.
- Refactor:
  - Усунути дублювання на transport layer.
  - Почати з route-local helper у `workflows.ts`.
  - Якщо такий самий flow з'являється в кількох API resources, підняти reusable частини в `src/ops/http/` або
    `src/ops/grpc/`.
  - Не змішувати auth resolution з implicit `reply.send(...)` side effects в одному helper.
- Fast validation:
  - Один table-driven unit test для мапінгу auth помилок.

### 3) Подвійна валідація (`attachValidation` + `schema.parse`)

- Priority: `P1`
- Files:
  - `src/api/v1/auth.ts:99-104,146-151,256-261`
  - `src/api/v1/workflows.ts:269-274,321-329,382-388,444-447`
- Problem:
  - Код перевіряє `request.validationError`, але потім знову викликає `schema.parse`.
  - Зайве дублювання й шум у handlers.
- Refactor:
  - Обрати один стиль:
    - або довіряти Fastify schema і працювати з typed `request.body/params/query`,
    - або централізований `safeParse` wrapper без `attachValidation`.
- Fast validation:
  - Snapshot-style integration tests на 400 responses залишаються зеленими.

### 4) `submitAnswer` дозволяє невалідний payload

- Priority: `P0`
- File:
  - `src/api/v1/workflows.ts:105-108,390-399`
- Problem:
  - `optionId` і `rawInput` обидва optional.
  - Можна відправити `{}` і сервер піде в gRPC з порожнім `selectOption`.
- Refactor:
  - Задати xor-схему: рівно одне з `optionId` або `rawInput`.
  - Явно повернути `400 INVALID_ARGUMENT` для порожнього/конфліктного payload.
- Fast validation:
  - Додати 3 тести: `{}`, `{optionId, rawInput}`, валідні single-field варіанти.

### 5) Нестрога типізація gRPC requests через `Record<string, unknown>`

- Priority: `P1`
- Files:
  - `src/api/v1/workflows.ts:332-335`
  - `src/api/v1/workflows.ts:503-506`
- Problem:
  - Втрачаються compile-time гарантії по полях запиту.
- Refactor:
  - Ввести typed builders (`buildGetRunViewRequest(...)`) на базі типів з
    `@platformik/contracts-workflows-ts`.
- Fast validation:
  - `tsc` має падати при неправильному полі, а не в runtime.

### 6) Магічні gRPC коди в `mapGrpcError`

- Priority: `P2`
- File:
  - `src/api/v1/workflows.ts:76-99`
- Problem:
  - Коди `3/5/7/16` закодовані числами, погана читабельність.
- Refactor:
  - Використати enum/status constants (`INVALID_ARGUMENT`, `NOT_FOUND`, etc.) або локальну map-таблицю.
- Fast validation:
  - Unit test table для code->HTTP status.

### 7) Runtime policy значення жорстко зашиті у логічних файлах

- Priority: `P1`
- Files:
  - `src/api/v1/workflows.ts:16`
  - `src/ops/event-bus/event-bus.ts:10-12`
- Problem:
  - `HEARTBEAT_INTERVAL_MS`, Redis wait/reconnect константи в коді.
  - Це суперечить repo принципу про timing/policy values.
- Refactor:
  - Додати `src/config/workflows-stream.ts` і `src/config/event-bus.ts`.
  - Передавати policy в конструктори (`registerWorkflowRoutes`, `createEventBusListener`).
- Fast validation:
  - Smoke tests з малими timeout значеннями в test env.

### 8) `workflowEventsResponseSchema = z.any()`

- Priority: `P2`
- File:
  - `src/api/v1/workflows.ts:149`
- Problem:
  - `z.any()` не документує shape подій SSE endpoint.
  - Але для цього маршруту більший ризик зараз не у Fastify schema, а у відсутності ізольованих тестів на
    event/delta generation.
- Refactor:
  - Спочатку ввести typed stream events/deltas і unit-тести на них.
  - Після цього вирішити, чи route-level `schema.response` має описувати документований SSE envelope, чи
    залишатися broad schema для streaming route.
- Fast validation:
  - Контрактні тести подій SSE.

### 9) Розсинхрон форматів помилок між endpoints

- Priority: `P2`
- Files:
  - `src/api/v1/auth.ts` (частина маршрутів повертає `{ message }`)
  - `src/api/v1/workflows.ts` (повертає `{ error: { code, message } }`)
- Problem:
  - Для клієнтів API неоднорідні error shapes у межах однієї API версії.
- Refactor:
  - Уніфікувати error envelope для `/api/v1/*` (або офіційно закріпити різницю через docs і shared schemas).
- Fast validation:
  - Один shared error schema пакет + route-level schema assertions.

### 10) `extractSessionToken` читає тільки один `set-cookie`

- Priority: `P1`
- File:
  - `src/api/v1/auth.ts:66-71`
- Problem:
  - Якщо `session_token` не в першому cookie, токен не буде знайдено.
- Refactor:
  - Використати `getSetCookieHeaders` з `ops/http/headers.ts` та парсити масив cookies.
- Fast validation:
  - Тест з двома `set-cookie` заголовками, де `session_token` у другому.

### 11) Container зростається в одну точку знань про всі підсистеми

- Priority: `P2`
- File:
  - `src/container.ts:38-97`
- Problem:
  - `build()` відповідає одразу за всі runtimes, hooks, plugins, routes, rate-limit bypass.
- Refactor:
  - Винести в окремі factory helpers:
    - `createIamRuntime(...)`
    - `createWorkflowsRuntime(...)`
    - `registerHttpPlugins(...)`
    - `registerHttpRoutes(...)`
- Fast validation:
  - Integration smoke `build()` + `server.close()`.

### 12) Глобальний rate-limit bypass прив’язаний до route URL string

- Priority: `P1`
- Files:
  - `src/container.ts:78-83`
  - `src/api/v1/auth.ts:43-48`
- Problem:
  - Логіка залежить від exact string URL; легко зламати при зміні шляху/версії/префіксів.
- Refactor:
  - Використати route config flag (наприклад `config.skipGlobalRateLimit`) замість ручного `Set<string>`.
- Fast validation:
  - Тест, що новий auth route автоматично отримує правильний ліміт без правки централізованого set.

### 13) `event-bus` має щільний цикл стану, підписок і читання стрімів без ізольованих unit-tests

- Priority: `P1`
- Files:
  - `src/ops/event-bus/event-bus.ts`
  - `src/features/workflows/workflow-run-notifier.ts`
- Problem:
  - Складна поведінка на reconnection/close/error, але немає тестів.
- Refactor:
  - Декомпозувати на pure helpers (`nextTopics`, `updateCursor`, `dispatchSubscriptions`).
  - Якщо batch уже торкається `#1`, переносити workflow notifier разом з іншою workflow orchestration у
    `src/application/workflows/`.
  - Додати unit-тести для reconnection/timeout/rejectAllWaiters.
- Fast validation:
  - deterministic fake-redis/fake-timer tests.

### 14) Недостатнє тестове покриття workflows API

- Priority: `P1`
- Files:
  - Відсутні `src/api/v1/workflows*.test.ts`
  - Є лише `src/api/v1/auth.test.ts`
- Problem:
  - Найскладніший transport path (SSE + gRPC + notifier) без тестового safety net.
- Refactor:
  - Додати `workflows.test.ts` (integration) і `workflows-stream.test.ts` (unit, поруч з stream/orchestration
    модулем у цільовій структурі).
  - Мінімум покриття: auth fail, validation fail, grpc error mapping, SSE heartbeat, pending_input clear,
    terminal stop.

### 15) Seed script тримає dev credentials у коді і логах

- Priority: `P1`
- File:
  - `bin/seed.ts:9,47,64`
- Problem:
  - Хардкод пароля + логування пароля.
- Refactor:
  - Читати пароль із env з безпечним fallback тільки для local-dev.
  - Не логувати пароль у явному вигляді.
- Fast validation:
  - Idempotent seed test + assert по логам.

### 16) Дублювання env schema між `src/config.ts`, `bin/migrate.ts`, `bin/seed.ts`

- Priority: `P2`
- Files:
  - `src/config.ts:6-17`
  - `bin/migrate.ts:9-12`
  - `bin/seed.ts:11-14`
- Problem:
  - Кожен entrypoint окремо описує env, зростає drift-ризик.
- Refactor:
  - Винести маленькі reusable env loaders у `src/config/` (`loadDatabaseEnv`, `loadApiEnv`).
- Fast validation:
  - Type-level reuse + однакові валідаційні повідомлення.

### 17) `ai-providers` endpoint має порожній контракт

- Priority: `P2`
- File:
  - `src/api/v1/ai-providers.ts:5-18`
- Problem:
  - Повертається `{}` з `z.object({})`; endpoint радше заглушка без явного плану еволюції.
- Refactor:
  - Або прибрати тимчасово endpoint,
  - або зафіксувати мінімальний контракт `providers: []` з назвою/статусом.
- Fast validation:
  - Integration test контракту відповіді.

## Suggested execution order

1. `P0`: #4
2. `P1`: #14, #1, #2, #3, #5, #7, #10, #12, #13, #15
3. `P2`: #6, #8, #9, #11, #16, #17

## Definition of done for refactor batch

- `mise exec -- moon run api-platform-ts:fix`
- `mise exec -- moon run api-platform-ts:validate`
- `mise exec -- moon run tooling-content:format-fix`
- `mise exec -- moon run tooling-content:validate`
