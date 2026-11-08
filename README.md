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
- The browser SDK defaults to `/api/v1`; pass another `basePath` to `historyTransport(...)` / `new ScreeningClient(...)` when the HTTP client already adds it.

### Run with Docker

```bash
docker compose up --build     # postgres, mailpit, one-shot migrate+seed, API on :3000
```

The `api` service reads `.env` (optional) and overrides `DATABASE_URL` and `MAIL_*` to the compose services. Credential documents persist in the `credentials` volume. The runtime image defaults to `NODE_ENV=production`; the compose stack sets `development` explicitly, and `docker-compose.production.yml` switches it to the production profile.

## Quality checks

```bash
pnpm typecheck      # tsc --noEmit for the server, strict DOM check for client-sdk
pnpm lint:check     # eslint without auto-fix
pnpm format:check   # prettier --check
pnpm test           # every unit and in-memory e2e spec (root jest.config.cjs)
pnpm test:cov       # same with coverage in coverage/
pnpm test -- src/domain/identity          # focus on one area (any path pattern)
```

`pnpm test` never contacts a real database, SMTP server or network. On machines with little free memory (for example with Docker running) add `--maxWorkers=2`.

### Real-PostgreSQL tests

Add the test-only variables from `.env.example` to your `.env` once:

```dotenv
DB_TEST_DATABASE_URL=postgresql://mindcare:mindcare@127.0.0.1:5432/mindcare_test
SHADOW_DATABASE_URL=postgresql://mindcare:mindcare@127.0.0.1:5432/mindcare_shadow
```

Then:

```bash
docker compose up -d postgres   # creates mindcare_test and mindcare_shadow on first start
pnpm test:db
```

A value set in the shell overrides `.env` (PowerShell: `$env:DB_TEST_DATABASE_URL="..."`; bash: `DB_TEST_DATABASE_URL=... pnpm test:db`).

`test:db` **drops and recreates** the database in `DB_TEST_DATABASE_URL` (`prisma migrate reset`), seeds reference data, then runs `test/db/**/*.db-spec.ts`: refresh-token races, password-reset revocation, serializable retries, row and advisory locks, reminder leases, history vault concurrency and seeder idempotency. It refuses any database whose name does not end in `_test` and never uses `DATABASE_URL`.

### Migrations and API contract

```bash
pnpm db:drift        # prisma/ schema == prisma/migrations (uses SHADOW_DATABASE_URL)
pnpm openapi:check   # rebuilds and fails if docs/openapi.json is stale
```

Regenerate the committed contract with `pnpm build && pnpm openapi:generate` whenever controllers or DTOs change.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`:

| Job          | Checks                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quality      | typecheck, lint, format, all tests with coverage                                                                                                                                                                     |
| database     | migrations on an empty PostgreSQL 16, drift check, seeder twice, `test:db`                                                                                                                                           |
| api-contract | `docs/openapi.json` up to date; breaking changes vs. the base branch (accept with the `breaking-change` label)                                                                                                       |
| image        | builds `runtime` and `migrator` images, starts the compose stack with `docker/smoke.env`, probes `/health/ready`, then restarts the API in the production profile and checks HSTS, `/docs` 404 and a versioned route |
| audit        | blocks on high or critical production advisories                                                                                                                                                                     |

Dependabot (`.github/dependabot.yml`) opens weekly npm and monthly Actions/Docker update PRs.

### Dependency security exceptions

`pnpm audit` must stay clean. Current measures in `package.json` → `pnpm`:

- `overrides`: `multer`, `glob` and `minimatch` are forced to patched versions until the packages that depend on them update.
- `patchedDependencies`: `deepmerge@4.3.1` (pulled in by Jest and the Nest CLI) is patched in `patches/` to drop `__proto__`, `constructor` and `prototype` keys, because no upstream release fixes GHSA-gcqx-w48m-w2h4. That GHSA is listed in `auditConfig.ignoreGhsas` only because the version number cannot change.

When Dependabot brings versions that fix these upstream, remove the matching override, patch and ignore entry.

## Privacy rules for contributors

- Never log, persist, cache or send to analytics any screening answer or result of a guest.
- Never log credential numbers, documents, tokens, passwords or request bodies.
- History content is encrypted on the client; the server must never hold a key that can decrypt it.
- No screening-result notifications to third parties.

## License

UNLICENSED — private project.
