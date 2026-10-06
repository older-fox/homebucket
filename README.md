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
- **Two databases, one model**: MySQL and SQLite ("MySQL light") are generated as two schemas from a single `models.prisma`.

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
- **Two database backends**: MySQL (default) and SQLite ("MySQL light"), from one shared model.

## Tech stack

| Layer | Choice |
| --- | --- |
| Backend | NestJS 11 + Prisma 6.19 (Express 5) |
| Frontend | Nuxt 4 (Vue 3.5) + Nuxt UI v4 + Tailwind v4, SSR |
| Database | MySQL (default) / SQLite ("MySQL light", file-based) |
| Deployment | Single Docker container (multi-stage build); GitLab CI builds and pushes the image with kaniko inside the container |

**Not a monorepo**: `server/` and `web/` are two fully independent npm packages, each with its own `package.json` and `node_modules`. The repository root only holds environment files, the Dockerfile, CI and docs.

## Directory structure

```
.
├── .env / .env.example      # environment variables (.env is gitignored, shared by both apps)
├── Dockerfile               # multi-stage build; one container runs both apps at runtime
├── docker-entrypoint.sh
├── .dockerignore
├── .gitlab-ci.yml           # kaniko image pipeline (build in-container → push to the project registry)
├── server/                  # NestJS + Prisma
│   ├── prisma/
│   │   ├── src/models.prisma        # single source of truth for models (shared by both providers)
│   │   ├── mysql/{schema.prisma,migrations/}   # generated; migrations contain a single init
│   │   └── sqlite/{schema.prisma,migrations/}  # generated; migrations contain a single init
│   ├── scripts/
│   │   ├── build-schemas.mjs        # generates both schemas from the single source
│   │   ├── prisma.mjs               # Prisma CLI wrapper (picks provider + rebuilds schemas)
│   │   └── seed.mjs                 # demo data
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── config/env.ts            # all config (lazily reads process.env)
│       ├── config/bootstrap-admin.ts# creates the admin on first boot of an empty DB
│       ├── common/                  # family-context guard, param decorators, validation normalization
│       ├── logger/                  # app logger + nginx-style access log
│       ├── prisma/                  # PrismaService + auto-migrate
│       ├── auth/                    # register / login / me (username + password, JWT)
│       ├── families/                # families, members, invite links
│       ├── locations/               # location tree (moves decided server-side)
│       ├── items/                   # items + SN units + CSV export
│       ├── tags/                    # tags
│       ├── templates/               # templates and "create item from template"
│       ├── uploads/                 # uploads (local / S3 abstraction)
│       ├── collection/              # barcode data-collection client
│       ├── notifiers/               # notifiers (SMTP / Telegram / DingTalk …)
│       ├── dashboard/  search/  scan/
│       └── ...
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
npm run prisma:generate   # generate the Prisma Client for DB_PROVIDER
npm run prisma:deploy     # apply migrations (an empty DB runs the single init migration)
npm run start:dev         # http://localhost:3001/api

# 3) frontend (in another terminal)
cd web
npm install
npm run dev               # http://<your-lan-ip>:3000
```

Endpoints: `GET /api` (info), `GET /api/health` (health check), `POST /api/auth/register` (username + password, email optional), `POST /api/auth/login` (**username** + password), `GET /api/auth/me` (requires `Authorization: Bearer <token>`).

Want to see it populated right away? `cd server && npm run seed` (see "Demo data" below).

## Configuration

Everything lives in the root `.env`, shared by the frontend build/runtime and the backend process.

### General / database

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment |
| `DB_PROVIDER` | `mysql` | `mysql` or `sqlite` ("MySQL light", no database server needed) |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`; **do not quote it** (see the note below) |
| `SHADOW_DATABASE_URL` | commented out | Dev only: shadow database for `prisma migrate dev` on MySQL |
| `AUTO_MIGRATE` | `true` | Run `prisma migrate deploy` on process start (an empty DB gets its tables created) |
| `DB_FILE_PATH` | `file:./data/homebucket.db` | SQLite file path (in Docker use `file:/data/homebucket.db`) |

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

### One model source, two schemas

Prisma's `provider` cannot come from an environment variable, so models are maintained only in `server/prisma/src/models.prisma`; `scripts/build-schemas.mjs` prepends a different provider header to generate:

- `server/prisma/mysql/schema.prisma` (`DATABASE_URL`)
- `server/prisma/sqlite/schema.prisma` (`DB_FILE_PATH`)

`npm run prisma:generate` / `prisma:migrate` / `prisma:deploy` all rebuild both schemas first, so there is nothing to sync by hand.

### Migrations squashed into a single init

Each provider's `migrations/` directory now holds **one** migration, `20261006000000_init` (plus `migration_lock.toml`) — a full snapshot of the current schema. The production database was empty, so there was no history worth keeping.

- **Fresh / production database**: just `npm run prisma:deploy` (or start the backend) — all tables are created at once.
- **A dev database that ran the old migrations**: the tables exist, but `_prisma_migrations` still lists the 6 old entries, so `deploy` fails with "table already exists". Pick one:
  1. Reset (wipes data, then re-seed with `npm run seed`):
     `npx prisma migrate reset --schema prisma/mysql/schema.prisma --skip-seed`
  2. Reconcile the records only, keeping data: run `DELETE FROM _prisma_migrations;` on the database, then
     `npx prisma migrate resolve --applied 20261006000000_init --schema prisma/mysql/schema.prisma`

### Migrate on boot

On startup (`AUTO_MIGRATE=true`, the default) the backend runs `prisma migrate deploy` first:

- an empty database gets its tables created, so "table does not exist" startup failures are gone;
- it is idempotent — already-applied migrations are not re-run;
- failures only log a `[migrate]` error and do not block the process (`/health` reports `degraded`); a database that is unreachable also no longer aborts startup.

To control it yourself: `AUTO_MIGRATE=false`, then `cd server && npm run prisma:deploy`.

On the **first boot of an empty database** an admin is also created from `DEFAULT_ADMIN_*` (disable with `AUTO_CREATE_ADMIN=false`); the credentials are printed to the log — change the password after logging in.

### SQLite ("MySQL light")

```bash
# .env
DB_PROVIDER=sqlite
DB_FILE_PATH="file:./data/homebucket.db"   # in a real .env, no quotes
```

Then `npm run prisma:generate && npm run prisma:deploy`. The database file lands in `server/prisma/sqlite/data/` (gitignored).

## Docker (single container)

Multi-stage build: `base → server-build → web-build → runtime`, with targeted `COPY` (no `COPY . .`); `.dockerignore` excludes `node_modules` / `dist` / `.output` / `.nuxt`. At runtime one container starts Nest (`:3001`) and Nuxt (`:3000`), with the frontend proxying to the backend.

```bash
docker build \
  --build-arg DB_PROVIDER=mysql \
  --build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn \
  -t homebucket .

docker run -d --name homebucket --env-file .env -v hb-data:/data -p 3000:3000 homebucket
```

- All container data lives under `/data` (SQLite file + uploaded images) and `VOLUME ["/data"]` is declared, so mounting a volume persists it. Usually only port 3000 needs to be exposed.
- Migrations run automatically when the backend process starts.
- The base image installs `openssl` (required by the Prisma query engine) before `prisma generate`. The apt source for that step defaults to the Tsinghua mirror (`APT_MIRROR`) purely to speed it up.
- **devDependencies are deliberately not pruned at runtime**: the boot-time auto-migration needs the `prisma` CLI (`server/src/prisma/auto-migrate.ts` resolves `prisma/build/index.js`), and `--omit=dev` would make migrations silently skip. The frontend `.output` is self-contained, so `web/node_modules` is not shipped.
- `NODE_IMAGE` / `NPM_REGISTRY` / `APT_MIRROR` are acceleration build args; you can omit them locally to use the official sources. `APT_MIRROR` must be `http://` — the slim image has no `ca-certificates`, so `https` makes `apt-get update` fail certificate verification.

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
| `NODE_IMAGE` | `docker.1ms.run/library/node:22-bookworm-slim` | Base image (Docker Hub acceleration) |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm registry |
| `APT_MIRROR` | `http://mirrors.tuna.tsinghua.edu.cn` | Debian apt mirror (speeds up the openssl install); must be `http://` |
| `DB_PROVIDER` | `mysql` | Prisma schema baked into the image |

The kaniko image lives on gcr.io and is pulled via `gcr.m.daocloud.io/kaniko-project/executor:debug` (`docker.m.daocloud.io` is the Docker Hub accelerator and does not have that repository — it fails with "not in the allowlist"). The first run creates `$CI_REGISTRY_IMAGE/cache` as a build cache; if your registry disallows sub-repositories, drop the `--cache=true --cache-repo ...` lines.

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
cd server && npm run seed
```

This wipes and rebuilds only the demo accounts' data (other users are untouched) and produces a showcase-ready sample:

- Log in with **username + password** (email is only a record field): the main account comes from `.env` `DEFAULT_ADMIN_*` (defaults `admin` / `admin`) and owns the "Sample Home" household
- A shared member: `family@homebucket.local` / `homebucket123` (a regular member, handy for testing multi-household and permissions)
- Content: 41 locations (three-level tree), 17 tags, 147 items (about ¥59,924 total), 20 serial numbers across 12 items (including one item whose SNs sit in different locations), 14 templates, 4 disabled notifiers, 3 invite links
- Images: the script **generates 43 SVG placeholders locally** (37 item covers + 6 location photos) into `UPLOAD_DIR`, requesting no external images
- Item creation times are spread over ~180 days so "recently added" looks natural
- Idempotent and repeatable; the script is `server/scripts/seed.mjs`

## Verified

- **Nuxt 4**: Nuxt 4.5.2 + @nuxt/ui 4.11 + @nuxtjs/i18n 10.6 + Tailwind 4.3 + vue-tsc; application code moved into `web/app/`; `nuxt typecheck` reports zero errors, `nuxt build` passes, every page returns 200 and the `/api` proxy works.
- **API end to end**: household isolation and roles (cross-household 403, non-owner 403), invite links that join on registration, location-tree moves with cycle validation, one item with SNs in different locations, duplicate SN / barcode rejection, dashboard stats, unified search, CSV (UTF-8 BOM, SN@location, no thumbnail column), scan priority, create-from-template, 9 notifier types, validation error shape. Test data was cleaned up afterwards.
- **Backend**: `nest build` passes; register / login / me work, duplicate registration 409, wrong password and forged token 401, validation 400; with `MAX_UPLOAD_SIZE=1kb` a 2KB body returns 413; all three log formats and `LOG_ACCESS=false` behave as expected.
- **Migrate on boot**: starting against an empty SQLite database creates the file and tables and registration succeeds immediately; a second start prints `No pending migrations to apply`; `AUTO_MIGRATE=false` skips it.
- **Squashed migrations**: the single `init` migration deploys successfully on a fresh SQLite database, `migrate status` is up to date, and `migrate diff --from-migrations --to-schema-datamodel` prints `No difference detected`.
- **Docker**: the image builds; one container serves both apps with `0.0.0.0:3000` reachable, the `/api` proxy working and the backend connected to the dev MySQL (`db:true`); `docker build --check` reports no warnings.
- **CI**: the kaniko pipeline is a single job that runs in-container with no artifacts; mirrors and image paths are configured for this environment (not yet exercised on a real GitLab runner).
