const ANON_URL = 'http://127.0.0.1:4174/app/'
const DEADLINE_MS = 60_000
const RETRY_MS = 500

// Playwright's webServer check only confirms its configured URL, so poll the anon
// preview here until it answers or the deadline passes.
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + DEADLINE_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ANON_URL)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, RETRY_MS))
  }
  throw new Error('Port 4174 is not serving dist-anon. Stop any other preview server on 4173 and rerun.')
}
