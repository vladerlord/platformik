import { render } from 'ink'
import { App } from '../src/app'
import { BffClient } from '../src/api/client'

const argv = process.argv.slice(2)
let loginEmail: string | undefined
let loginPassword: string | undefined

for (let i = 0; i < argv.length - 1; i++) {
  if (argv[i] === '--login') loginEmail = argv[i + 1]
  if (argv[i] === '--password') loginPassword = argv[i + 1]
}

if (!loginEmail || !loginPassword) {
  process.stderr.write('Usage: cli --login <email> --password <password>\n')
  process.exit(1)
}

const baseUrl = process.env.BFF_BASE_URL ?? 'http://localhost:3000'
const client = new BffClient(baseUrl)

render(<App client={client} email={loginEmail} password={loginPassword} />)
