import { loadEnv } from './loadEnv.js'

/**
 * Start New Relic before Express, `pg`, and the other CommonJS clients load.
 * ESM evaluates this module to completion (including the top-level await)
 * before the later imports in index.ts, which is what lets the agent's
 * require hooks see those packages.
 *
 * No license key means no agent. Local dev and tests stay quiet.
 * The key is an ingest license key (40-char), never a user API key (NRAK-).
 */
loadEnv()

const licenseKey = process.env.NEW_RELIC_LICENSE_KEY?.trim() ?? ''
const agentEnabled = licenseKey.length > 0 && !licenseKey.startsWith('NRAK-')

if (licenseKey.startsWith('NRAK-')) {
  console.error('[newrelic] NEW_RELIC_LICENSE_KEY is a user API key (NRAK-). The agent was not started. Use the ingest license key.')
}

if (agentEnabled) {
  process.env.NEW_RELIC_APP_NAME ||= 'smartsht-api'
  process.env.NEW_RELIC_NO_CONFIG_FILE ||= 'true'
  process.env.NEW_RELIC_LOG ||= 'stdout'
  process.env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED ||= 'false'
  process.env.NEW_RELIC_RECORD_SQL ||= 'obfuscated'
  process.env.NEW_RELIC_ATTRIBUTES_EXCLUDE ||= [
    'request.headers.cookie',
    'request.headers.authorization',
    'request.headers.proxyAuthorization',
    'request.headers.setCookie*',
    'response.headers.setCookie*',
    'request.headers.x-api-key',
    'request.headers.x-user-id',
  ].join(',')
  await import('newrelic')
}

export const newRelicEnabled = agentEnabled
