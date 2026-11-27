# Share feature and deploy: remaining tasks

Open items left after the share-feature fixes and deploy hardening shipped on 2026-11-27 (commits `6df2a99` to `4aa0e715`). None of them blocks current work.

## Share feature

- [ ] **"Shared by" names can be faked.** The sender types any name, so a link can say "Shared by Smartsht Support" on the smartsht.com domain. Options: a note on the shared view such as "name provided by the sender", and/or rejecting reserved names (smartsht, support, admin) at share creation in `server/src/routes/shares.ts`.
- [ ] **Expired shares are never deleted on the server.** Only the dialog's "Remove expired" button cleans them up (`src/components/ShareDialog.tsx`). Add a sweep that deletes `smartsht.shares` rows past `expires_at`. The existing purge job (`server/src/workbookPurge.ts`) could run it.
- [ ] **Decide: should a share keep the name it was created with?** `shared_by_name` is fixed when the link is created, so if the sender later changes their name or email, old links keep showing the old one. This is probably the intended behavior. Confirm it, or resolve the name at read time instead.

## Deploy and operations

- [ ] **Verify the `deploy.sh` self-update on its first real use.** The next deploy that changes `scripts/deploy.sh` should log `deploy.sh changed in this update - re-running the new version` in `/opt/smartsht/logs/deploy.log`. So far it has only been tested on a throwaway local git repo.
- [ ] **Database TLS is not certificate-verified.** The URL's `sslmode=require` overrides `rejectUnauthorized: true`, so the API and `server/scripts/run-migration.mjs` accept any RDS certificate. The fix is to pin the AWS RDS CA bundle and verify it. This changes the production DB connection. It was already known and is tracked in `docs/MAJOR_CHANGES.md` (2026-11-13).

## Done (for reference)

- Revoke route, "Shared by" name with an "Include my email" checkbox, smartsht.com links, noindex on shared views, error handling in the share dialog and the shared view.
- Migration 008 applied in production. `deploy.sh` runs migrations before the restart, and `/health?strict=1` fails when any shipped migration is unapplied.
- `deploy.sh` runs safely when an update changes it. Old `.env` backups removed. Shared-view rate limit raised to 60 a minute per IP.
