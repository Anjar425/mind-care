## Summary

<!-- What changes and why. Link the plan/decision document if there is one. -->

## How it was verified

- [ ] `pnpm typecheck`, `pnpm lint:check`, `pnpm format:check`
- [ ] `pnpm test`
- [ ] `pnpm test:db` (when persistence, transactions or locks change)
- [ ] Manual check (describe):

## Impact

- [ ] Prisma schema / migration change (expand-and-contract; migration reviewed)
- [ ] API contract change (`docs/openapi.json` regenerated; `breaking-change` label if clients break)
- [ ] New or changed environment variable (`.env.example` and README updated)
- [ ] New dependency (approved; audit clean)

## Privacy checklist

- [ ] No screening answers or results are logged, persisted for guests, cached or sent to analytics
- [ ] No credential numbers, documents, tokens, passwords or request bodies in logs, errors or fixtures
- [ ] History content stays client-encrypted; no new server-side decryption path
