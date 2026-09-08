#!/usr/bin/env node
/**
 * Cross-platform entry for `npm run deploy*`.
 *
 * package.json used to hard-invoke PowerShell, which fails on macOS/Linux
 * even though scripts/deploy-remote.sh exists. This dispatcher picks the
 * native wrapper and translates flag spellings:
 *   npm  --server / --frontend / --skip-push
 *   ps1  -Server  / -Frontend  / -SkipPush
 *   sh   --server / --frontend
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

const PS_FLAGS = {
  '--server': '-Server',
  '--frontend': '-Frontend',
  '--skip-push': '-SkipPush',
}

function toPowershellArgs(argv) {
  return argv.map((flag) => PS_FLAGS[flag] ?? flag)
}

const isWindows = process.platform === 'win32'

const result = isWindows
  ? spawnSync(
      'powershell',
      [
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'scripts', 'deploy-remote.ps1'),
        ...toPowershellArgs(args),
      ],
      { stdio: 'inherit', cwd: root },
    )
  : spawnSync('bash', [path.join(root, 'scripts', 'deploy-remote.sh'), ...args], {
      stdio: 'inherit',
      cwd: root,
    })

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
