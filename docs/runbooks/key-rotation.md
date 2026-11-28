# Key rotation

Three secrets can be rotated without logging users out or losing credential data. Each is a **key ring**: a comma-separated list of `kid:secret`, newest first. The first key signs or seals; every key verifies or opens. A setting without a ring (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`) is the ring `k0:<that secret>`, and data written before key ids existed belongs to `k0`.

| Ring                         | Replaces                    | Secret format                                             | Data                                                     |
| ---------------------------- | --------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `JWT_ACCESS_KEYS`            | `JWT_ACCESS_SECRET`         | ≥ 32 bytes, no commas                                     | access tokens (`kid` in the JWT header)                  |
| `JWT_REFRESH_KEYS`           | `JWT_REFRESH_SECRET`        | ≥ 32 bytes, no commas, never shared with an access key    | refresh tokens                                           |
| `CREDENTIAL_ENCRYPTION_KEYS` | `CREDENTIAL_ENCRYPTION_KEY` | 64 hex characters, never equal to `CREDENTIAL_LOOKUP_KEY` | credential numbers and documents (`v2.<kid>.…` envelope) |

Key ids: 1–32 characters `A–Z a–z 0–9 _ -`, unique within a ring. Generate secrets from a CSPRNG (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); store them only in the platform's secret store, never in Git, tickets or chat.

## Rotate the access-token key

1. Set `JWT_ACCESS_KEYS=k1:<new>,k0:<current>` (keep `k0` second) and deploy. New tokens carry `kid: k1`; tokens signed with `k0` stay valid.
2. Wait at least `ACCESS_TOKEN_TTL_SECONDS` (default 15 minutes) after the deploy finished on every instance.
3. Set `JWT_ACCESS_KEYS=k1:<new>` and deploy. Remove `JWT_ACCESS_SECRET` from the environment.

## Rotate the refresh-token key

Same as above with `JWT_REFRESH_KEYS`, but wait `SESSION_TTL_DAYS` (default 7 days) in step 2: refresh tokens live as long as their session. Removing the old key earlier ends the remaining sessions (users sign in again), which is the emergency procedure after a leak.

## Rotate the credential encryption key

1. Set `CREDENTIAL_ENCRYPTION_KEYS=k1:<new>,k0:<current>` and deploy. New numbers and documents are sealed with `k1`; old ones still open with `k0`.
2. Check what will move (no writes):
    ```bash
    pnpm credentials:reencrypt            # or: node dist/jobs/cli/maintenance.cli.js credentials:reencrypt
    ```
    The JSON report lists `scanned`, `numbers`, `documents` and `failed`. `failed` must be 0; otherwise stop and investigate (missing object, wrong key).
3. Re-seal in place:
    ```bash
    pnpm credentials:reencrypt --apply
    ```
    Safe to re-run; a second run reports 0 numbers and 0 documents. Exit code 3 means another instance is already running it.
4. Set `CREDENTIAL_ENCRYPTION_KEYS=k1:<new>` and deploy. Remove `CREDENTIAL_ENCRYPTION_KEY`.

Keep the old key in the secret store (not in the environment) until the next backup cycle has passed: restoring a backup taken before step 3 needs it.

`CREDENTIAL_LOOKUP_KEY` (duplicate-credential detection) is not a ring: rotating it requires recomputing every stored lookup in one maintenance window and is not covered here.

## Moving credential documents to object storage

Needed before running more than one API instance.

1. Create a private bucket (no public access, server-side encryption on). Documents are already AES-GCM sealed by the application.
2. Configure `S3_BUCKET`, `S3_REGION`, optionally `S3_ENDPOINT` (S3-compatible services) and `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (otherwise the AWS default credential chain), keeping `STORAGE_DRIVER=local`.
3. `pnpm storage:migrate` (dry run), then `pnpm storage:migrate --apply`. Every copy is read back and compared by SHA-256; nothing is deleted or overwritten. `conflicts` and `failed` must be 0.
4. Set `STORAGE_DRIVER=s3` and deploy. Keep `.private/` until a backup of the bucket exists, then delete it.

## Drill

`pnpm test:db` runs the rotation end to end on PostgreSQL and an S3-compatible bucket (`test/db/key-rotation.db-spec.ts`), and `src/api/common/auth/jwt-key-ring.spec.ts` covers token verification across key changes.
