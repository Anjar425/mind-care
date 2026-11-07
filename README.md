# MindCare backend

NestJS + Prisma (PostgreSQL) API for MindCare, a mental-health **screening support** platform. It is not a diagnostic tool: every result carries a non-diagnostic disclaimer.

Two independent screening systems:

- **QDSS / DASS21** — group-decision consensus over expert preferences, calibrated with a genetic algorithm per expert group (and globally).
- **DASS42 Mamdani** — fuzzy rule-based inference over rules authored by credentialed experts within a group. Fails closed: invalid or conflicting rules never produce a partial or fallback result.

## Roles

| Role | Can |
|---|---|
| Guest | Run QDSS (global or an eligible published group) and DASS42 (eligible published group). Nothing is stored. |
| USER | Same as guest, plus an optional private history encrypted on the client with user-held keys. |
| EXPERT | Upload STR/SIP credentials, maintain profile and DASS21 preferences, join groups, author DASS42 rules, resolve rule conflicts, calibrate group QDSS. |
| ADMIN | Review expert credentials, manage global QDSS calibration, notify rule-conflict participants. Admins never edit or approve expert rules. |

## Stack

Node.js, NestJS 11, Prisma 7 with the `pg` adapter, PostgreSQL, Passport JWT (session-bound access tokens, rotating refresh tokens), class-validator, Swagger, Helmet, `@nestjs/throttler`, `@nestjs/terminus`, `@nestjs/schedule`, Nodemailer.

## Module map (`src/`)

| Folder | Responsibility |
|---|---|
| `auth/`, `user/` | Registration, login per role, sessions, email verification, password reset |
| `common/` | Config validation, app setup, response envelope, exception filter, rate-limit guard, shared utils |
| `mail/` | SMTP delivery and HTML templates (`mail/templates/*.html`, values are always HTML-escaped) |
| `reference-data/` | DASS21/DASS42 catalogs and the reference seeder |
| `expert/`, `expert-credentials/`, `expert-preferences/` | Expert profile, credential upload/review/expiry, DASS21 preferences |
| `groups/` | Expert groups, invitations, leadership, eligibility, public listing |
| `rules/`, `rule-conflicts/` | DASS42 rule authoring and conflict resolution workflow |
| `qdss/` | QDSS math, datasets, GA calibration, pinned models |
| `dass42-inference/` | Mamdani inference engine |
| `screenings/` | Public QDSS/DASS42 screening endpoints (+ browser client in `client/`) |
| `history/` | Encrypted history vault API (+ browser client in `client/`) |
| `health/` | Liveness and readiness probes |
| `prisma/` | Prisma service, schema (`models/*.prisma`) and migrations |

## Prerequisites

- Node.js (current LTS) and pnpm
- PostgreSQL for local development
- An SMTP server or local sink (for example Mailpit) for verification and reset emails

## Setup

```bash
pnpm install
cp .env.example .env          # then fill in the placeholders
pnpm exec prisma generate
pnpm exec prisma migrate deploy   # applies migrations to the database in DATABASE_URL
pnpm seed:references          # DASS21/DASS42 reference catalogs
```

`.env` is git-ignored. Never commit real secrets. Configuration is validated at startup; an invalid key stops the app and is reported by name only.

There is no public administrator registration. The first ADMIN account currently has to be created directly in the database by an operator; a dedicated CLI is planned.

## Run

```bash
pnpm start:dev      # watch mode on PORT (default 3000)
pnpm build          # runs prisma generate, then nest build (copies mail templates)
pnpm start:prod     # node dist/main
```

Swagger UI is served at `/docs` outside production. `NODE_ENV=production` is deliberately rejected until the production deployment profile is approved.

## Quality checks

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint:check     # eslint without auto-fix
pnpm lint           # eslint with --fix
pnpm test           # all unit specs under src/
pnpm exec jest -c test/jest-auth.config.cjs   # one feature suite (unit + isolated e2e)
```

Feature suites: `test/jest-{api-foundation,api-security,auth,dass42-inference,expert-credentials,expert-preferences,expert-profile,groups,history,qdss,reference-data,rule-conflicts,rules,screenings}.config.cjs`. Tests use mocked or in-memory persistence; they never contact a real database, SMTP server or network.

## Privacy rules for contributors

- Never log, persist, cache or send to analytics any screening answer or result of a guest.
- Never log credential numbers, documents, tokens, passwords or request bodies.
- History content is encrypted on the client; the server must never hold a key that can decrypt it.
- No screening-result notifications to third parties.

## License

UNLICENSED — private project.
