export default async function globalSetup(): Promise<void> {
  try {
    const res = await fetch('http://127.0.0.1:4174/app/')
    if (res.ok) return
  } catch {
    /* fall through */
  }
  throw new Error('Port 4174 is not serving dist-anon. Stop any other preview server on 4173 and rerun.')
}
