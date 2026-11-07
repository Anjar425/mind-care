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

## Module map (`src/`)

| Folder                                                  | Responsibility                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `auth/`, `user/`                                        | Registration, login per role, sessions, email verification, password reset                        |
| `common/`                                               | Config validation, app setup, response envelope, exception filter, rate-limit guard, shared utils |
| `mail/`                                                 | SMTP delivery and HTML templates (`mail/templates/*.html`, values are always HTML-escaped)        |
| `reference-data/`                                       | DASS21/DASS42 catalogs and the reference seeder                                                   |
| `expert/`, `expert-credentials/`, `expert-preferences/` | Expert profile, credential upload/review/expiry, DASS21 preferences                               |
| `groups/`                                               | Expert groups, invitations, leadership, eligibility, public listing                               |
| `rules/`, `rule-conflicts/`                             | DASS42 rule authoring and conflict resolution workflow                                            |
| `qdss/`                                                 | QDSS math, datasets, GA calibration, pinned models                                                |
| `dass42-inference/`                                     | Mamdani inference engine                                                                          |
| `screenings/`                                           | Public QDSS/DASS42 screening endpoints (+ browser client in `client/`)                            |
| `history/`                                              | Encrypted history vault API (+ browser client in `client/`)                                       |
| `health/`                                               | Liveness and readiness probes                                                                     |
| `prisma/`                                               | Prisma service, schema (`models/*.prisma`) and migrations                                         |

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
pnpm build          # runs prisma generate, then nest build (copies mail templates)
pnpm start:prod     # node dist/main
```

Swagger UI is served at `/docs` outside production. `NODE_ENV=production` is deliberately rejected until the production deployment profile is approved.

### Run with Docker

```bash
docker compose up --build     # postgres, mailpit, one-shot migrate+seed, API on :3000
```

The `api` service reads `.env` (optional) and overrides `DATABASE_URL` and `MAIL_*` to the compose services. Credential documents persist in the `credentials` volume. The image runs with `NODE_ENV=development` and is for local/CI use only until the production profile exists.

## Quality checks

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint:check     # eslint without auto-fix
pnpm format:check   # prettier --check
pnpm test           # every unit and in-memory e2e spec (root jest.config.cjs)
pnpm test:cov       # same with coverage in coverage/
pnpm exec jest -c test/jest-auth.config.cjs   # one feature suite
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
pnpm db:drift        # schema == migrations (uses SHADOW_DATABASE_URL)
pnpm openapi:check   # rebuilds and fails if docs/openapi.json is stale
```

Regenerate the committed contract with `pnpm build && pnpm openapi:generate` whenever controllers or DTOs change.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`:

| Job          | Checks                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| quality      | typecheck, lint, format, all tests with coverage                                                                 |
| database     | migrations on an empty PostgreSQL 16, drift check, seeder twice, `test:db`                                       |
| api-contract | `docs/openapi.json` up to date; breaking changes vs. the base branch (accept with the `breaking-change` label)   |
| image        | builds `runtime` and `migrator` images, starts the compose stack with `docker/smoke.env`, probes `/health/ready` |
| audit        | blocks on high or critical production advisories                                                                 |

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
