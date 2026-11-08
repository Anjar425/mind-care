# MindCare backend

NestJS + Prisma (PostgreSQL) API for MindCare, a mental-health **screening support** platform. It is not a diagnostic tool: every result carries a non-diagnostic disclaimer.

Two independent screening systems:

- **QDSS / DASS21** — group-decision consensus over expert preferences, calibrated with a genetic algorithm per expert group (and globally).
- **DASS42 Mamdani** — fuzzy rule-based inference over rules authored by credentialed experts within a group. Fails closed: invalid or conflicting rules never produce a partial or fallback result.

## Roles

| Role   | Can                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest  | Run QDSS (global or an eligible published group) and DASS42 (eligible published group). Nothing is stored.                                           |
| USER   | Same as guest, plus an optional private history encrypted on the client with user-held keys.                                                         |
| EXPERT | Upload STR/SIP credentials, maintain profile and DASS21 preferences, join groups, author DASS42 rules, resolve rule conflicts, calibrate group QDSS. |
| ADMIN  | Review expert credentials, manage global QDSS calibration, notify rule-conflict participants. Admins never edit or approve expert rules.             |

## Stack

Node.js, NestJS 11, Prisma 7 with the `pg` adapter, PostgreSQL, Passport JWT (session-bound access tokens, rotating refresh tokens), class-validator, Swagger, Helmet, `@nestjs/throttler`, `@nestjs/terminus`, `@nestjs/schedule`, Nodemailer.

## Source layout

```text
src/
  app.module.ts      composition root: api audiences + jobs + runtime config
  api/               HTTP layer; one folder per audience, mirroring the URL tree
    common/          guards and strategies (auth/), GlobalExceptionFilter + @ErrorPolicy (errors/),
                     rate limit, privacy middleware, pipes, Swagger helpers, response interceptor,
                     DTOs shared by several audiences (dto/<area>/)
    public/          auth, references, public group listing, guest/account screenings
    account/         the signed-in account's own data (encrypted history)
    expert/          EXPERT routes: profile, credentials, preferences, groups (+ rules, conflicts, QDSS)
    admin/           ADMIN routes: credential review, global QDSS, conflict oversight
    health/          liveness and readiness probes
  domain/            business logic per area; Nest modules with providers only, no controllers
    identity/  reference-data/  credentials/  expert/  preferences/  groups/
    rules/ (+ conflicts/)  rule-conflicts/  qdss/  dass42/  screening/  history/
  jobs/              scheduled work (ScheduleModule is registered only here)
  infrastructure/    config validation, Prisma (service, withTransaction, generated client), mail
  shared/            framework-free code: wire contracts used by server and SDK, role enum, utils
  client-sdk/        browser-only history/screening SDK; not part of the server build
prisma/              schema.prisma, models/*.prisma, migrations/
```

Dependency rules, enforced by `pnpm lint:check` (`eslint.config.mjs`, specs are exempt); `src/domain/domain-dependencies.spec.ts` keeps the domain graph acyclic:

| Layer            | May import                                                                     |
| ---------------- | ------------------------------------------------------------------------------ |
| `api/<audience>` | `api/common`, `domain`, `infrastructure`, `shared`                             |
| `api/common`     | `domain`, `infrastructure`, `shared` (never an audience)                       |
| `domain`         | other domain folders (acyclic), `infrastructure`, `shared`                     |
| `jobs`           | `domain`, `infrastructure`, `shared`                                           |
| `infrastructure` | `shared`                                                                       |
| `shared`         | nothing project-internal, no `@nestjs/*`                                       |
| `client-sdk`     | `shared/contracts` only (checked with `tsconfig.client-sdk.json`, DOM, strict) |

Conventions:

- One controller class per `*.controller.ts`. Request/response classes are `*Dto` (queries `*Query`) in the audience's `dto/`, or in `api/common/dto/<area>/` when more than one audience uses them.
- Each domain owns one `<domain>.types.ts`. Service inputs are domain interfaces (`*Input`, `*Filter`); HTTP DTOs `implements` them, so a DTO change that breaks a domain input fails to compile.
- Transactions go through `withTransaction(prisma, work, policy)`; each domain keeps its policy (isolation, retries, 409/503 wording) next to its persistence helpers.
- Error rendering is centralised in `GlobalExceptionFilter`; controllers that must redact (`auth`, `history`, `screening`) declare `@ErrorPolicy(...)`.
- `test/app-composition.e2e-spec.ts` boots the real `AppModule` graph; `src/domain/domain-modules.spec.ts` and `src/api/api-modules.spec.ts` check module isolation and that each audience only serves its own paths.

## Prerequisites

- Node.js 24 (`.nvmrc`) and pnpm 10 (`corepack enable` picks the version from `packageManager`)
- Docker Desktop (recommended) for PostgreSQL and Mailpit, or your own PostgreSQL and SMTP sink

Line endings are LF everywhere (`.gitattributes`, `.editorconfig`, Prettier). After pulling this change on Windows, re-checkout or run `pnpm format` once if your editor still shows CRLF.

## Setup

```bash
pnpm install
cp .env.example .env          # then fill in the placeholders
docker compose up -d postgres mailpit   # local database + mail sink (optional)
pnpm exec prisma generate
pnpm db:migrate               # applies migrations to the database in DATABASE_URL
pnpm seed:references --apply  # DASS21/DASS42 reference catalogs (idempotent)
```

With the compose database use `DATABASE_URL=postgresql://mindcare:mindcare@127.0.0.1:5432/mindcare` and `MAIL_HOST=127.0.0.1`, `MAIL_PORT=1025` (Mailpit UI: http://localhost:8025). Prefer `127.0.0.1` over `localhost`: on some Windows setups `localhost` resolves to IPv6 `::1`, which Docker does not forward.

`.env` is git-ignored. Never commit real secrets. Configuration is validated at startup; an invalid key stops the app and is reported by name only.

There is no public administrator registration. The first ADMIN account currently has to be created directly in the database by an operator; a dedicated CLI is planned.

## Run

```bash
pnpm start:dev      # watch mode on PORT (default 3000)
pnpm build          # runs prisma generate, then nest build (copies mail templates; excludes client-sdk)
pnpm start:prod     # node dist/main
```

Swagger UI is served at `/docs` when `SWAGGER_MODE=public` (the default outside production).

### Production profile

`NODE_ENV=production` is supported and assumes the first deployment layout: the frontend and the API on one origin behind a single TLS-terminating reverse proxy.

| Setting                                         | Production default         | Effect                                                                                 |
| ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `CORS_ORIGIN`                                   | none (same-origin)         | No CORS headers; set https origins (comma list) only for a separate frontend origin    |
| `TRUST_PROXY_HOPS`                              | 0 (set 1 behind the proxy) | Express trusts that many `X-Forwarded-For` hops; rate limits key on the real client IP |
| `SWAGGER_MODE`                                  | `off`                      | `/docs`, `/docs-json` and `/docs-yaml` return 404                                      |
| `ACCESS_TOKEN_TTL_SECONDS` / `SESSION_TTL_DAYS` | 900 / 7                    | Access token and refresh session lifetimes                                             |
| `DB_POOL_MAX` / `DB_STATEMENT_TIMEOUT_MS`       | 10 / 15000                 | Connection pool size; per-statement and idle-in-transaction timeout                    |

Production also requires `https://` for `FRONTEND_URL` and every CORS origin, sends HSTS (1 year, subdomains) and Helmet's default strict CSP. The reference seeder still refuses `NODE_ENV=production` (ingestion needs its own authorization policy), so production migrations run `prisma migrate deploy` only; seed reference data separately until that policy exists. Secrets, TLS, backups and point-in-time recovery are provider configuration, not part of this repository.

Try the profile locally (synthetic values, Swagger off, HSTS on):

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build --wait api
```

### HTTP API conventions

- Every route lives under `/api/v1` (`API_BASE_PATH` in `src/shared/contracts/api.ts`); only the probes `/health/live` and `/health/ready` are unversioned.
- No `/me` routes: the caller is implied by the access token. Own resources are `/api/v1/account/...` (history) and `/api/v1/expert/...` (profile, preferences, credentials, groups, group invitations, leadership transfers, DASS42 rules, notifications).
- Every error body is `{ statusCode, code, message[], error }`. `code` is stable and catalogued in `src/shared/contracts/error-codes.ts` (`ErrorCode` in the OpenAPI document); clients branch on `code`, never on `message`. A service may set a catalogued code explicitly with `new HttpException({ message, code }, status)`; history and screening routes always use their fixed, redacted code per status.
- Action rate limits are declared on the handler with `@RateLimit('login' | 'register' | ...)`; the no-store/body-bound privacy middleware is mounted at the controller's own base path (`PRIVACY_BOUNDARIES` in `src/api/app.setup.ts`). Renaming a route therefore cannot silently drop either.

### Running more than one instance

- **Rate limits are shared.** Counters live in PostgreSQL (UNLOGGED table `RateLimitBucket`, updated atomically by the `rate_limit_hit()` function), so every instance enforces one quota. Keys are SHA-256 hashes; no IP or email is stored.
- **Per-account limits.** Login (`RATE_LIMIT_LOGIN_ACCOUNT`, default 10) and forgot-password / resend-verification (`RATE_LIMIT_EMAIL_ACCOUNT`, default 5) are also limited per submitted email, whatever the client IP. The 429 body is the same for existing and unknown addresses.
- **If the counter store is unavailable**, general traffic and screenings continue; login, registration, forgot-password, resend-verification, refresh and credential upload return 503 `UNAVAILABLE`.
- **Scheduled work runs on one instance at a time.** The credential maintenance job takes a lease row (`JobLease`) each tick; other instances skip. A lease of a crashed instance expires after 10 minutes. The same tick deletes expired rate-limit buckets.
- **Not yet shared:** credential documents are still on local disk (`.private/`), so more than one instance needs the object-storage step of Phase 3C first.
