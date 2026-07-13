import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..')

export function loadEnv(): void {
  dotenv.config({ path: path.join(serverRoot, '.env') })
}
