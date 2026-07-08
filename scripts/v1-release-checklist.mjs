import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function runCommand(command, description, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options })
    return { pass: true, description, detail: command }
  } catch {
    return { pass: false, description, detail: command }
  }
}

function checkFileIncludes(path, needle, description) {
  const content = readFileSync(path, 'utf8')
  const pass = content.includes(needle)
  return { pass, description, detail: `${path} includes "${needle}"` }
}

function printGate(result) {
  const status = result.pass ? 'PASS' : 'FAIL'
  console.log(`${status} - ${result.description}`)
  console.log(`       ${result.detail}`)
}

function main() {
  console.log('V1 Release Checklist\n')
  const root = resolve(process.cwd())
  const serverDir = resolve(root, 'server')

  const gates = []
  gates.push(runCommand('npm run test', 'Frontend tests pass', { cwd: root }))
  gates.push(runCommand('npm run test', 'Server tests pass', { cwd: serverDir }))
  gates.push(runCommand('npm run build', 'Frontend build succeeds', { cwd: root }))
  gates.push(runCommand('npm run build', 'Server build succeeds', { cwd: serverDir }))

  gates.push(checkFileIncludes(
    resolve(root, 'src/io/xlsx.ts'),
    'sheetLimitHits',
    'Import truncation guardrails are present',
  ))
  gates.push(checkFileIncludes(
    resolve(root, 'src/store/useStore.ts'),
    'requiresPreview',
    'Preview-denial safety gate is present',
  ))
  gates.push(checkFileIncludes(
    resolve(root, 'src/ai/brain.ts'),
    "recordTelemetry('deterministicResponses'",
    'Deterministic response telemetry is instrumented',
  ))
  gates.push(checkFileIncludes(
    resolve(root, 'src/ai/brain.ts'),
    "recordTelemetry('llmResponses'",
    'LLM response telemetry is instrumented',
  ))

  console.log('\nGate Results:')
  gates.forEach(printGate)

  const failing = gates.filter((g) => !g.pass)
  if (failing.length > 0) {
    console.error(`\nChecklist failed (${failing.length} gate(s) not met).`)
    process.exit(1)
  }

  console.log('\nChecklist passed. V1 release gates are satisfied.')
}

main()

