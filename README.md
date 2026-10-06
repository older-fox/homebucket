# Homebucket

**English** | [简体中文](./README.zh-CN.md)

> **A modern replacement for [HomeBox](https://github.com/hay-kot/homebox):** keep track of where everything is stored.

## Introduction

**Homebucket is a modern, self-hosted alternative to [HomeBox](https://github.com/hay-kot/homebox)** — an independent project, not affiliated with or endorsed by the HomeBox project. It keeps the same core idea (a location tree plus an inventory ledger) but is rebuilt on today's stack, with extra work put into multi-member households, serial-number tracking, barcodes and mobile use.

If you're coming from HomeBox, these are the differences worth knowing first:

- **Multi-member households**: registering creates your personal household; an invite link lets you join someone else's. One account can belong to several households and switch between them at any time. Every query is hard-scoped by `familyId`, with `owner` / `admin` / `member` roles.
- **Several serial numbers of the same item can live in different places**: two identical floor fans, one in the storeroom and one in the bedroom, each with its own SN and location.
- **Templates that close the loop with barcodes**: a template can be bound to a product barcode — scan it and the template is applied. The barcode field comes first when creating an item.
- **Optional barcode data collection**: a built-in client for a "barcode → product info" service, so scanning a new barcode can auto-fill name / manufacturer / model.
- **i18n out of the box**: Chinese (primary) and English (secondary); translations are plain JSON files that the community can submit new languages to.
- **Single-container deployment**: one image runs both frontend and backend, with the frontend reaching the API through a built-in proxy — same origin, so there is no CORS to configure.
- **Two databases, one model**: MySQL and SQLite ("MySQL light") share one set of hand-written TypeORM entities — same tables, same behaviour; only the driver differs.

Once you own enough things, "where did I put this?" becomes a recurring question. Homebucket answers it with a **location tree + item ledger**: every item records where it is, how many there are and what it's worth — and each serial number (SN / barcode) of an item can point at its own location.

### Core concepts

| Concept | Description |
| --- | --- |
| **Family** | The data boundary. Registering creates a personal household; accepting an invite adds more. Every query is hard-scoped by `familyId`; only the household owner can manage members and invite links. |
| **Location** | An arbitrarily deep tree (entrance / living room / bedroom / storeroom / garage …). Supports drag-and-drop ordering and cross-level moves, plus photos and QR codes. |
| **Item** | The basic ledger entry: name, description, quantity, unit price, model, manufacturer, location, tags, photos, product barcode, and an optional system trace code. |
| **Item unit (SN)** | Items that need per-piece tracking can register multiple SNs — **each SN can sit in a different location**. |
| **Tag** | A cross-location classification, shown as bookmark-style pills. |
| **Template** | Preset data for frequently added items, applied in one tap. A template can also be bound to a product barcode so scanning it applies the template. |
| **Notifier** | SMTP / Google Chat / Telegram / Discord / DingTalk / Feishu / WeCom / Bark / ServerChan, subscribed per event, with a test-send button. |
| **Scanning** | QR generation + camera scanning + image recognition + manual input / barcode gun. Resolution priority: **product barcode → item/location QR → SN**. |

### Highlights

- **Single-container deployment**: one Docker container runs the Nest backend and the Nuxt frontend together; the frontend reaches the backend through a built-in proxy, so it is same-origin with no CORS.
- **No external dependencies at runtime**: fonts, icons and the logo are all self-hosted (local woff2 + local lucide icon set) — works on a LAN or fully offline.
- **Migrate on boot**: an empty database creates its tables on first start and seeds an admin from `DEFAULT_ADMIN_*`.
- **i18n**: Chinese primary, English secondary; translation files are standalone and community-submittable. The backend only returns machine-readable `code`s.
- **Real mobile support**: bottom tab bar with a scan hub, drill-down navigation for locations, swipe actions, in-page scrolling layouts — not just a re-flowed desktop page.
- **Two database backends**: MySQL (default) and SQLite ("MySQL light"), from one shared set of TypeORM entities.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS 12.1 + TypeORM 1.1 (`@nestjs/typeorm` 12) on Express 5 |
| Frontend | Nuxt 4.6 (Vue 3.5) + Nuxt UI v4 + Tailwind v4, SSR |
| Database | MySQL (default, `mysql2`) / SQLite ("MySQL light", `better-sqlite3`) |
| Deployment | Single Docker container (multi-stage build); GitLab CI builds and pushes the image with kaniko inside the container |

**Not a monorepo**: `server/` and `web/` are two fully independent npm packages, each with its own `package.json` and `node_modules`. The repository root only holds environment files, the Dockerfile, CI and docs.

**Runtime & versions**: Node **24** LTS (NestJS 12 and Nuxt 4.6 require `^22.22.3 || ^24.15.0`). NestJS 12's packages are ESM-only, but the backend still runs as CommonJS via Node's `require(esm)` support. `typescript` is pinned to `~6.0.3`: TypeScript 7 ships only the `tsc` binary and no programmatic compiler API, which the Nest CLI requires (`nest build` refuses it outright), so 6.0.3 is the newest usable version. TS 6 also needs an explicit `"rootDir": "./src"` in `tsconfig.json` (without it the output becomes `dist/src/main.js`) and an explicit `"types": ["node", "express", "multer"]` array (TS 6 no longer loads all `@types` implicitly, so e.g. `@types/multer`'s global `Express.Multer` augmentation would not apply).

## Directory structure

```
.
├── .env / .env.example      # environment variables (.env is gitignored, shared by both apps)
├── Dockerfile               # multi-stage build; one container runs both apps at runtime
├── docker-entrypoint.sh
├── .dockerignore
├── .gitlab-ci.yml           # kaniko image pipeline (build in-container → push to the project registry)
├── server/                  # NestJS + TypeORM
│   ├── scripts/
│   │   ├── db-baseline.mjs          # register an existing (Prisma-era) database as "Init already applied"
│   │   └── seed.mjs                 # demo data
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── config/env.ts            # all config (lazily reads process.env)
│       ├── config/bootstrap-admin.ts# creates the admin on first boot of an empty DB
│       ├── common/                  # family-context guard, param decorators, validation normalization
│       ├── logger/                  # app logger + nginx-style access log
│       ├── entities/                # 11 entity classes (single source of truth) + index.ts + transformers
│       ├── database/                # data-source / DatabaseModule / auto-migrate / migrations/{mysql,sqlite}
│       ├── auth/                    # register / login / me (username + password, JWT)
│       ├── families/                # families, members, invite links
│       ├── locations/               # location tree (moves decided server-side)
│       ├── items/                   # items + SN units + CSV export
│       ├── tags/                    # tags
│       ├── templates/               # templates and "create item from template"
│       ├── uploads/                 # uploads (local / S3 abstraction)
│       ├── collection/              # barcode data-collection client
│       ├── notifiers/               # notifiers (SMTP / Telegram / DingTalk …)
│       │   └── channels/            # one file per channel (smtp / telegram / dingtalk …)
│       ├── dashboard/  search/  scan/
│       └── ...                      # every domain is <domain>.module.ts + .controller.ts + .service.ts (+ dto.ts)
└── web/                     # Nuxt 4 + Nuxt UI v4 + Tailwind v4
    ├── nuxt.config.ts               # listen address, /api proxy, i18n, icons
    ├── i18n/locales/{zh-CN,en}.json # translation files (single source, community-submittable)
    ├── i18n/README.md               # guide for adding a language
    ├── public/logo.svg
    └── app/                         # the Nuxt 4 app directory
        ├── app.vue  app.config.ts
        ├── assets/css/main.css      # Tailwind + design tokens
        ├── layouts/{default,auth}.vue
        ├── middleware/auth.global.ts
        ├── composables/             # useApi useAuth useFamily useFormat useNav
        │                            # useBreakpoint useLocations useTreeExpansion
        ├── components/              # SearchBox SwipeRow ListPager ListSkeleton
        │                            # LocationTree LocationDetail LocationDialogs
        │                            # ItemForm UnitEditor TagPicker LocationPicker
        │                            # PhotoUploader PageHeader EmptyState …
        ├── types/location.ts
        └── pages/                   # index / login / register / locations[index,[id]]
                                     # items[index,new,[id]] / templates / settings
                                     # search / scan / invite/[token] / r/[code]
```

## Quick start

```bash
# 1) environment
cp .env.example .env      # at minimum set DATABASE_URL (or switch to sqlite)

# 2) backend
cd server
npm install
npm run db:run            # apply migrations (an empty DB gets all tables)
npm run start:dev         # http://localhost:3001/api
                          # (AUTO_MIGRATE=true also applies migrations at boot, so db:run is optional)

# 3) frontend (in another terminal)
cd web
npm install
npm run dev               # http://<your-lan-ip>:3000
```

Endpoints: `GET /api` (info), `GET /api/health` (health check), `POST /api/auth/register` (username + password, email optional), `POST /api/auth/login` (**username** + password), `GET /api/auth/me` (requires `Authorization: Bearer <token>`).

Want to see it populated right away? `cd server && npm run build && npm run seed` (see "Demo data" below).

## Configuration

Everything lives in the root `.env`, shared by the frontend build/runtime and the backend process.

### General / database

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment |
| `DB_PROVIDER` | `mysql` | `mysql` or `sqlite` ("MySQL light", no database server needed) |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`; **do not quote it** (see the note below). Individual fields can be overridden with `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` |
| `AUTO_MIGRATE` | `true` | Run the TypeORM migrator in-process on start (an empty DB gets its tables created) |
| `DB_FILE_PATH` | `./data/homebucket.db` | SQLite file path, resolved from `server/`; a legacy `file:` prefix is stripped (in Docker use `/data/homebucket.db`) |

### Backend (Nest)

| Variable | Default | Description |
| --- | --- | --- |
| `SERVER_PORT` | `3001` | Backend listen port |
| `API_PREFIX` | `api` | Route prefix |
| `CORS_ORIGIN` | `*` | Allowed origins, comma-separated |
| `MAX_UPLOAD_SIZE` | `1gb` | Request body / upload limit; accepts `1024`, `10mb`, `1gb` |

### Logging

| Variable | Default | Description |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` / `verbose` |
| `LOG_FORMAT` | `pretty` | `pretty` (colored) / `json` (single-line JSON) / `nginx` (nginx style) |
| `LOG_ACCESS` | `true` | Emit nginx combined-style access logs |

### Data directory & file storage

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Data root (in Docker it is `/data`, mount a volume to persist) |
| `UPLOAD_DIR` | `${DATA_DIR}/uploads` | Upload directory; empty means auto-derived. In `local` mode files are served at `/api/media/<key>` |
| `STORAGE_DRIVER` | `local` | `local` writes to disk; `s3` uses an S3-compatible object store |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_FORCE_PATH_STYLE` | — | S3 settings (used when `STORAGE_DRIVER=s3`) |
| `DEFAULT_CURRENCY` | `CNY` | Default base currency for new households (amounts use the household base currency only) |
| `DEFAULT_LOCALE` | `zh-CN` | Default language (overridable per household in settings) |
| `PUBLIC_BASE_URL` | empty | Site root written into QR codes, e.g. `http://192.168.1.10:3000`; empty means QR codes contain only the token |

### First-run / default admin

| Variable | Default | Description |
| --- | --- | --- |
| `AUTO_CREATE_ADMIN` | `true` | Create the admin automatically on first boot of an empty DB |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ADMIN_EMAIL` | `admin` / `admin` / `admin@example.com` | Account used on first init (empty DB boot or `npm run seed`); **login uses the username**, the email is only a record. Change these in production |

### Barcode data collection

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_COLLECTION_ENABLED` | `true` | Master switch; when off this instance never calls out |
| `DATA_COLLECTION_ENDPOINT` | placeholder | Collection service URL (**separate project**; replace with your own) |
| `DATA_COLLECTION_SUBMIT` | `true` | Whether to send back barcodes filled in on this instance |
| `DATA_COLLECTION_TIMEOUT_MS` | `1500` | Request timeout; failures degrade silently |

### Auth

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | — | Signing key for login tokens (change in production) |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `ALLOW_REGISTRATION` | `true` | Whether sign-up is open; when `false` every registration request is rejected (including sign-up via an invite link), existing accounts keep working and the frontend hides its sign-up entries |

### Frontend (Nuxt)

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_HOST` | `0.0.0.0` | Listen IP; `0.0.0.0` means reachable from the LAN / outside the container |
| `WEB_PORT` | `3000` | Listen port |
| `NUXT_PUBLIC_API_BASE` | `/api` | API base used by the browser (defaults to the same-origin proxy) |
| `NUXT_API_BASE` | `http://127.0.0.1:3001/api` | API base used during SSR |
| `API_PROXY_TARGET` | `http://127.0.0.1:3001` | Target of the Nuxt `/api` proxy |

> Changing `.env` requires a restart; `LOG_*` and port settings are read at startup.
>
> **Note**: `docker run --env-file .env` does **not** strip quotes, so do not quote values such as `DATABASE_URL` or `DB_FILE_PATH`.

## Database & migrations

### One entity set, two providers

The data model lives in hand-written entity classes in `server/src/entities/*.entity.ts` (**11 entities**, listed in `server/src/entities/index.ts`); that one set drives both MySQL and SQLite. Data access goes through injected `Repository<T>` (`@InjectRepository`): the global `DatabaseModule` exports `TypeOrmModule.forFeature(entities)`, so business modules inject repositories without repeating a `forFeature` list.

Three cross-provider conventions are documented at the top of `entities/index.ts` and worth keeping in mind when editing entities:

| Convention | Why |
| --- | --- |
| Explicit `@Entity('TableName')` | TypeORM's default naming strategy is snake_case (`ItemUnit` → `item_unit`); the existing tables are camel-case, so a default name means "no such table" |
| No `precision` option on `@CreateDateColumn` / `@UpdateDateColumn` | `{ precision: 3 }` makes TypeORM emit `datetime(3) ... DEFAULT CURRENT_TIMESTAMP(6)`, which MySQL rejects ("Invalid default value"; the same column then fails with "Invalid ON UPDATE clause"). Bare columns let TypeORM generate valid DDL per provider and still set the values in JS on insert/update |
| `decimalNumber` transformer on money columns | `mysql2` returns `DECIMAL` as a string while SQLite returns a number; the transformer makes `price` a JS `number` on both providers |

Enum / Json / BigInt are avoided entirely (SQLite does not support them): choices are stored as strings (documented in comments) and JSON is stored as text.

The SQLite driver is **`better-sqlite3`** (pinned to `13.x`) — `type: 'sqlite'` no longer exists in TypeORM 1.x. Its prebuilt binaries ship inside the npm tarball, so installing needs no compiler and no GitHub access; the image installs with `--ignore-scripts`, which also avoids the implicit `node-gyp rebuild` that the package would otherwise trigger.

### Migrations: two directories, four files

MySQL and SQLite DDL differ too much (auto-increment, type names, ALTER syntax, time defaults) to share one set of migrations, so the entities stay shared while each provider gets its own migration directory:

| Provider | Directory | Migrations |
| --- | --- | --- |
| MySQL | `server/src/database/migrations/mysql/` | `Init`, `NormalizeFromPrisma`, `RenamePrismaFkIndexes` |
| SQLite | `server/src/database/migrations/sqlite/` | `Init` |

npm scripts (replacing the old `prisma:*` ones):

| Script | What it does |
| --- | --- |
| `npm run db:generate` | `migration:generate` from the entities. Needs a target path: `npm run db:generate -- src/database/migrations/mysql/AddThing` |
| `npm run db:run` | `migration:run` |
| `npm run db:revert` | `migration:revert` (one migration at a time — see the warning below) |
| `npm run db:show` | `migration:show` (`migrations` table contents) |
| `npm run db:baseline` | register an existing Prisma-era database (see the upgrade section below) |
| `npm run seed` | demo/seed data |

`db:generate` / `db:run` / `db:revert` / `db:show` use `typeorm-ts-node-commonjs` with `-d src/database/data-source.ts`, so they run against `src/`. `db:baseline` and `seed` run against the compiled `dist/` output, so they require `npm run build` first — that is what lets them also run inside the production-dependency-only runtime image.

Migrations are provider-specific, so pass a path inside the right directory (`src/database/migrations/mysql/...` or `.../sqlite/...`) when generating.

> **⚠️ `db:revert` is not "undo `db:baseline`".** `db:baseline` only inserts a bookkeeping row — TypeORM does not know that `Init` never actually ran, so a revert will execute `Init.down()`, which expects TypeORM-named foreign keys. On a baselined Prisma-era database this fails with `Can't DROP ... FK_<hash>; check that column/key exists`; because `Init.down()` drops foreign keys first and the `DROP TABLE` statements come last, it aborts *before* anything is dropped, so tables and data survive. To get back to the Prisma-era schema, restore from a dump instead. On a **fresh install** (where `Init` really did run) reverting `Init` is a genuine teardown and *will* drop the tables, which is the normal, expected behaviour.

### Upgrading an existing Prisma-era database

This is the one operational step to be careful about. The tables already exist (they were created by Prisma) but there is no TypeORM `migrations` table, so a plain `migration:run` would try to create the tables again and fail.

1. `npm run db:baseline` — creates the TypeORM `migrations` table and records `Init` as already applied **without running any DDL** (the tables are already there). It refuses to run against a database with no application tables (that is a fresh install — just run the migrations) and it deliberately leaves the increment migrations pending.
2. `npm run db:run` — applies `NormalizeFromPrisma` and `RenamePrismaFkIndexes`.

The two increment migrations only affect Prisma-era databases:

- **`NormalizeFromPrisma`** skips itself on a fresh install (it probes for the Prisma foreign-key naming) and otherwise narrows `decimal(65,30)` → `decimal(12,2)` on `Item.price` / `Template.price`, widens `datetime(3)` → `datetime(6)` on `createdAt` / `updatedAt`, and adds a database default plus `ON UPDATE` to the `updatedAt` columns.
- **`RenamePrismaFkIndexes`** renames the 13 Prisma-named foreign-key backing indexes (`<Table>_<col>_fkey`) to TypeORM's `FK_<hash>` names, so future `migration:generate` runs are drift-free. MySQL cannot drop them (the foreign key needs them), which is why they are renamed rather than dropped.

Prisma's `_prisma_migrations` table is deliberately **left in place**: nothing reads it any more, and it can be dropped manually once you are confident. The upgrade path (baseline, then the two increments) preserves existing data and leaves the schema in the same shape as a fresh install.

For a **fresh install** there is nothing special to do: an empty database gets all its tables from `Init` on first boot or via `npm run db:run`.

### Migrate on boot

On startup (`AUTO_MIGRATE=true`, the default) the backend runs TypeORM's migrator **in-process** (`src/database/auto-migrate.ts`) before Nest is created — it no longer shells out to the Prisma CLI, which is what allows the runtime image to ship production dependencies only:

- an empty database gets its tables created, so "table does not exist" startup failures are gone;
- it is idempotent — already-applied migrations are not re-run (a second start logs `[migrate] provider=… 没有待执行的迁移`);
- failures only log a `[migrate]` error and do not block the process (`/health` reports `degraded`); a database that is unreachable also no longer aborts startup.

To control it yourself: `AUTO_MIGRATE=false`, then `cd server && npm run db:run`.

On the **first boot of an empty database** an admin is also created from `DEFAULT_ADMIN_*` (disable with `AUTO_CREATE_ADMIN=false`); the credentials are printed to the log — change the password after logging in.

### SQLite ("MySQL light")

```bash
# .env
DB_PROVIDER=sqlite
DB_FILE_PATH=./data/homebucket.db   # relative paths resolve from server/; a legacy "file:" prefix is stripped
```

Then `npm run db:run` (or just start the backend). With the default path the database file lands in `server/data/homebucket.db` (gitignored); in Docker use `DB_FILE_PATH=/data/homebucket.db`.

## Docker (single container)

Multi-stage build: `base → server-build → server-prod-deps → web-build → runtime`, with targeted `COPY` (no `COPY . .`); `.dockerignore` excludes `node_modules` / `dist` / `.output` / `.nuxt`. At runtime one container starts Nest (`:3001`) and Nuxt (`:3000`), with the frontend proxying to the backend.

```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t homebucket .

docker run -d --name homebucket --env-file .env -v hb-data:/data -p 3000:3000 homebucket
```

- All container data lives under `/data` (SQLite file + uploaded images) and `VOLUME ["/data"]` is declared, so mounting a volume persists it. Usually only port 3000 needs to be exposed.
- Migrations run automatically when the backend process starts (TypeORM's migrator, in-process).
- The base image is `node:24-bookworm-slim`. The old `openssl` apt layer is **gone** (it existed only for the Prisma query engine), and with it the `APT_MIRROR` build arg and the apt-source rewriting.
- The `DB_PROVIDER` **build arg is gone**: the image is provider-agnostic because both `mysql2` and `better-sqlite3` are production dependencies and the driver is chosen at runtime by the `DB_PROVIDER` env var. There is no `prisma generate` build step any more either.
- npm installs use BuildKit cache mounts (`# syntax=docker/dockerfile:1`, `RUN --mount=type=cache,target=/root/.npm`), so a BuildKit-enabled Docker is required; on older setups set `DOCKER_BUILDKIT=1` (or run a modern Docker).
- The runtime stage copies a **production-dependencies-only** `node_modules`: a dedicated `server-prod-deps` stage runs `npm ci --omit=dev --ignore-scripts`. This is safe for `better-sqlite3` because its prebuilt binding is loaded directly from the package; `--ignore-scripts` also avoids the implicit `node-gyp rebuild` that would otherwise need a compiler in the slim image. The frontend `.output` is self-contained, so `web/node_modules` is not shipped.
- `NODE_IMAGE` / `NPM_REGISTRY` are acceleration build args; you can omit them locally to use the official sources.

## CI (GitLab + kaniko)

`.gitlab-ci.yml` has a single job, `docker:image`:

- **The whole job runs inside a container**: it uses the kaniko executor (debug) image — no docker daemon / dind and no privileged runner required.
- **No typecheck, no separate build-verification job**: compilation happens inside `docker build` (`nest build` / `nuxt build`); if it fails, the job fails.
- **Zero artifacts**: the only output is an image pushed to the **project container registry** (`$CI_REGISTRY_IMAGE`).
- **Tag policy**: always pushes `sha-<short>`; the default branch additionally pushes `latest`; a git tag additionally pushes the version; other branches additionally push the branch slug.
- **Triggers**: push to any branch / tag / Run pipeline in the UI / API.

Acceleration mirrors (override via CI/CD Variables):

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_IMAGE` | `docker.1ms.run/library/node:24-bookworm-slim` | Base image (Docker Hub acceleration) |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm registry |

The kaniko image lives on gcr.io and is pulled via `gcr.m.daocloud.io/kaniko-project/executor:debug` (`docker.m.daocloud.io` is the Docker Hub accelerator and does not have that repository — it fails with "not in the allowlist"). The build uses `--cache=true --cache-repo "$CI_REGISTRY_IMAGE/cache"` plus `--snapshot-mode=redo` and `--use-new-run` (faster snapshotting for the many files under `node_modules`); if your registry disallows sub-repositories, drop the `--cache` lines. Note that this kaniko version parses but ignores BuildKit's `--mount=type=cache`, so the npm cache mounts only pay off in a local BuildKit build.

## How CORS is handled

Once the frontend is exposed with `WEB_HOST=0.0.0.0`, browsers may reach it via `localhost`, `127.0.0.1`, a LAN IP or a domain — enumerating an allowlist is unreliable. Therefore:

1. Nuxt proxies `/api/**` to the backend with a nitro `routeRules` entry (`API_PROXY_TARGET`), so the browser always requests `/api` **same-origin**;
2. the backend still enables `CORS_ORIGIN` (default `*`) and allows the `Authorization` header, which makes direct calls to `:3001` (debugging, third-party clients) easy.

## Frontend notes (Nuxt 4)

- Application code lives in `web/app/`: `pages` / `components` / `composables` / `layouts` / `middleware` / `assets` / `types`; `nuxt.config.ts`, `public/` and `i18n/` stay at the `web/` root.
- Icons use the local `@iconify-json/lucide` set, with no reliance on the Iconify online service. Note that `@nuxt/icon`'s endpoint is moved to `/_nuxt_icon`; otherwise the `/api/**` proxy forwards it to Nest and every icon fails to load.
- `@nuxt/fonts` is disabled (`ui: { fonts: false }`) in favor of a system font stack, so it runs offline / on an intranet.
- Anything needing auth is loaded on the client (`onMounted` / `useAsyncData(..., { server: false })`); SSR only renders the shell, avoiding 401s when there is no cookie during SSR.
- Unauthenticated visits are 302'd to the login page (the auth middleware runs on the server too).
- `npm run typecheck` (`nuxt typecheck`, vue-tsc) currently reports zero errors.
- Nuxt is on **4.6.0** and `vue-router` on `^5.3.1` (it was pinned at `^4.5.0` while Nuxt already required 5.x, so `node_modules` previously held two copies); `nuxt.config.ts` sets `sourcemap: { server: false }`, so the production build no longer emits server `.map` files. The `/api/**` proxy `routeRules` and the `icon` / `colorMode` / `i18n` configs are unchanged.

### Layout modes

Pages declare their scrolling mode via `definePageMeta`, and the shell switches with plain CSS classes (no render-time `matchMedia`, which avoids hydration mismatches and first-paint flicker):

- `layoutMode`: desktop `scroll` (whole page scrolls) / `fixed` (scroll inside a panel, used by list pages)
- `layoutModeMobile`: same for mobile; the location and item lists scroll the whole page on mobile and inside a panel on desktop
- `.desktop-only`: structures meant for desktop only are not rendered on mobile at all

### Visual spec (modern & clean)

- Design tokens live in `web/app/assets/css/main.css`: `--hb-brand` / `--hb-surface` / `--hb-text` / `--hb-shadow-*` / `--hb-r-*`, one set for light and one under `.dark`; **do not hard-code colors in pages**.
- Shared classes: `.hb-card`, `.hb-card-hover`, `.hb-tile`, `.hb-icon-tile`, `.hb-list` / `.hb-list-row` (unified row lists), `.hb-tag` (tag pill), `.hb-chip`, `.hb-section-title`, `.hb-skeleton`, `.hb-pager`, `.hb-rise`.
- Reusable components: `SearchBox` (shared by the home page and the item list), `SwipeRow` (mobile swipe-to-edit/delete), `ListPager`, `ListSkeleton`.
- Light/dark is driven by `@nuxtjs/color-mode` adding a `.dark` class (follows the system, can be toggled and remembered); the brand color is set in `app.config.ts` (Nuxt UI primary = teal).

### Typography

**Font families**: Latin letters and digits use self-hosted **Inter Variable** (`@fontsource-variable/inter/wght.css`, local woff2, no external requests); Chinese uses each platform's native font (PingFang SC / HarmonyOS Sans / MiSans / Microsoft YaHei / Noto Sans CJK / Source Han Sans) — CJK fonts are several MB each, and native glyphs look sharper and cost no bandwidth. Monospace uses `--hb-font-mono`.

**Type scale** (all via tokens; no raw px in pages): `--hb-fs-display` (a clamp-based page title) / `h1` / `h2` / `h3` / `body` / `sm` / `xs`, with matching line height `--hb-lh-*`, weight `--hb-fw-*` and tracking `--hb-ls-*`.

**Chinese-specific handling**: `:lang(zh)` raises line height to 1.75 and tracking to 0.01em; `html lang` follows the active language; `text-spacing-trim` / `text-autospace` improve CJK–Latin mixing; `font-synthesis: none` disables faux bold/italic; long strings use `.hb-break`, multi-line clamps use `.hb-clamp-2/3`.

**Numbers**: amounts, quantities and counts use `.hb-num` (`tabular-nums`) so columns line up without jitter.

**Utilities**: `.hb-display .hb-h1 .hb-h2 .hb-h3 .hb-body .hb-sm .hb-xs .hb-eyebrow .hb-label .hb-num .hb-mono .hb-link .hb-truncate .hb-clamp-* .hb-break`.

## Features & pages

| Page | Description |
| --- | --- |
| `/` Home | Item count / total value / location count / tag count, recently added items, location list, bookmark-style tags, search box (shares `SearchBox` with the item list) |
| `/locations` | Desktop: tree on the left, content on the right (**ordering and cross-level moves are decided server-side**, with cycle prevention and sortIndex requantization). Mobile: the tree takes the whole screen and tapping a node opens the drill-down route |
| `/locations/[id]` | Mobile location detail (portrait layout): sub-locations, items directly here, and serial numbers, each paginated |
| `/items` | Inventory overview and quick add. Desktop is a table (sticky header, scrolls inside the panel); mobile is a card list (icon tile + title/location/model/tags + amount) with **swipe to edit/delete**. Unified search covers name / model / SN / barcode / location / tags; CSV export |
| `/items/[id]` | Item detail: photos, tags, location, **each SN can be in a different location**, product barcode, trace code, QR code, source template |
| `/items/new` | Create an item; "apply template" at the top (or scan a template barcode to apply it); the product barcode field comes first and can be filled by scanning, and a system trace code can be generated when there is no barcode |
| `/templates` | Template management (including product barcodes), search and "create item from template" |
| `/settings` | Household management (members / invite links / roles), system settings (household name, currency, language, time zone), notifiers |
| `/search` | Unified search: items + locations + tags + serial numbers |
| `/scan`, `/r/[code]` | Camera scanning (needs https/localhost), image recognition, manual input / barcode gun. On mobile the bottom scan button opens a "create / find / edit" popover |

- **The household is the data boundary**: registering creates a personal household; accepting an invite grants access to more, switched via `X-Family-Id`; every query is hard-scoped by `familyId`. Only the household owner can manage members and invites.
- **Tag filtering on the item page**: there is no tag picker anymore; arriving from a tag bookmark (`?tagId=`) shows a one-tap removable filter chip.
- **Mobile**: bottom tab bar (scan in the middle as the primary entry), drawer menu, safe-area support, touch targets ≥44px, native keyboard types in forms.

## Product barcodes, trace codes & scan priority

- Items can carry a "product barcode" (EAN/UPC and friends), **unique within a household**; duplicates are rejected (`item.barcodeTaken`).
- When creating an item, **barcode comes first**: the field is at the top of the form and has a "scan to fill" button that jumps to the scan page and brings the code back (`/items/new?barcode=...`).
- **System trace code**: when an item has no manufacturer barcode, the create form offers a "Generate trace code" button. The code is minted server-side as `HB-XXXX-XXXX` (an alphabet without the easily confused `I/L/O/U`), is **unique within the household**, and is **immutable** — `UpdateItemDto` deliberately does not accept the field, so the only way to get a new one is to delete and recreate the item. Generate it with `POST /items/trace-code`.
- Scan resolution priority: **product barcode → trace code → template / item / location QR → SN**; responses carry `matchedBy` (`barcode` / `traceCode` / `qrcode` / `sn`) so the UI can tell the user how it matched.
- When a scanned code is unknown, the scan page offers "create an item with this barcode" and has a "scan to create" mode.
- The inventory unified search (`q`), the item list and the CSV export all include the barcode and trace-code columns.

## Barcode data collection

A **separate service** (provided by the developer) collects "barcode → product info", aggregates it, and syncs it to instances so that creating an item can auto-fill name / manufacturer / model. The switch and URL are in `.env` and it is **enabled by default**; `DATA_COLLECTION_ENDPOINT` is a placeholder — replace it with your own service.

The endpoint this instance exposes (used by the frontend):

```
GET /api/barcodes/:code/lookup
→ { barcode, local: {id,name,quantity,location}|null, remote: <collection service response>|null,
    collectionEnabled: boolean, collectionAvailable: boolean }
```

The contract the collection service must implement (the other project):

```
GET  {DATA_COLLECTION_ENDPOINT}/barcodes/{code}
  200 → { "barcode": "6901234567890", "name": "AA battery", "manufacturer": "Nanfu",
          "model": "alkaline", "category": "battery", "imageUrl": null,
          "confidence": 0.86, "sources": 12 }
  404 → not indexed

POST {DATA_COLLECTION_ENDPOINT}/observations
  body → { "barcode": "...", "name": "...", "manufacturer": "...", "model": "...",
           "category": "...", "clientVersion": "homebucket/1" }
  2xx  → accepted
```

Degradation: an unconfigured URL, a timeout, an unreachable network or a non-2xx response **only produce a log line** and never block barcode entry or item creation; the frontend only shows "filled from the barcode library" when remote data actually came back.

## Self-hosted static assets

No external CDN is contacted:

- Fonts: Latin/digits use local `@fontsource-variable/inter` woff2 files (split by `unicode-range`, so browsers load only the ~48KB latin subset); Chinese uses native system fonts; `@nuxt/fonts` is disabled
- Icons: the local `@iconify-json/lucide` set plus a self-hosted `/_nuxt_icon` endpoint, with `fallbackToApi: false` so it never falls back to the public Iconify API
- Images / logo: local files in `web/public/`; user uploads live in `UPLOAD_DIR` (local disk or your own S3)

## Internationalization

There is exactly one set of translation files, in `web/i18n/locales/` (primary `zh-CN`, secondary `en`). The backend does not translate: it returns machine-readable `code`s (e.g. `location.notFound`) and the frontend looks them up, falling back to the backend's Chinese `message` only when a code is missing.

To add a language: copy `web/i18n/locales/en.json` → rename → translate → register it in the `locales` array of `nuxt.config.ts`. See `web/i18n/README.md`.

## Demo data

```bash
cd server && npm run build && npm run seed   # seed runs against dist/, so build first
```

This wipes and rebuilds only the demo accounts' data (other users are untouched) and produces a showcase-ready sample:

- Log in with **username + password** (email is only a record field): the main account comes from `.env` `DEFAULT_ADMIN_*` (defaults `admin` / `admin`) and owns the "Sample Home" household
- A shared member: `family@homebucket.local` / `homebucket123` (a regular member, handy for testing multi-household and permissions)
- Content: 41 locations (three-level tree), 17 tags, 147 items (about ¥59,924 total), 20 serial numbers across 12 items (including one item whose SNs sit in different locations), 14 templates, 4 disabled notifiers, 3 invite links
- Images: the script **generates 43 SVG placeholders locally** (37 item covers + 6 location photos) into `UPLOAD_DIR`, requesting no external images
- Item creation times are spread over ~180 days so "recently added" looks natural
- Idempotent and repeatable; the script is `server/scripts/seed.mjs`

## Verified

- **Nuxt 4.6**: Nuxt 4.6.0 + @nuxt/ui 4.11.3 + @nuxtjs/i18n 10.6.0 + Tailwind 4.3.3 + vue-router 5.3.1 + vue-tsc; application code lives in `web/app/`; `nuxt typecheck` reports zero errors, `nuxt build` passes and the `/api` proxy works.
- **API end to end**: household isolation and roles (cross-household 403, non-owner 403), invite links that join on registration, location-tree moves with cycle validation, one item with SNs in different locations, duplicate SN / barcode rejection, dashboard stats, unified search, CSV (UTF-8 BOM, SN@location, no thumbnail column), scan priority, create-from-template, 9 notifier types, validation error shape. Test data was cleaned up afterwards.
- **Backend**: `nest build` passes; register / login / me work, duplicate registration 409, wrong password and forged token 401, validation 400; with `MAX_UPLOAD_SIZE=1kb` a 2KB body returns 413; all three log formats and `LOG_ACCESS=false` behave as expected.
- **Migrate on boot**: starting against an empty SQLite database creates the file and tables and registration succeeds immediately; a second start logs `[migrate] provider=sqlite 没有待执行的迁移`; `AUTO_MIGRATE=false` skips it.
- **Prisma-era upgrade**: `db:baseline` records `Init` without touching any table and leaves the increment migrations pending, then `db:run` applies `NormalizeFromPrisma` + `RenamePrismaFkIndexes`; the path was rehearsed and then applied with zero data loss, and the resulting schema matches a fresh install.
- **Docker**: the image builds with BuildKit; one container serves both apps with `0.0.0.0:3000` reachable, the `/api` proxy working and the backend connected to the dev MySQL (`db:true`); `docker build --check` reports no warnings.
- **CI**: the kaniko pipeline is a single job that runs in-container with no artifacts; mirrors and image paths are configured for this environment (not yet exercised on a real GitLab runner).
