# Read-only and write API

An HTTP interface for scripts, Home Assistant, backup jobs and your own dashboards. A key has one of
two scopes: **read-only** (the default) can only query, **write items** can also change items,
serial numbers and stock.

## Create a key

**Settings → API key → New key**, then pick "Read-only" or "Can write items" next to the name.
The secret is shown once at creation; afterwards you only see its prefix. **The scope cannot be
changed later** — revoke the key and create a new one instead. Keys belong to your **account**, not
to a family: a key sees and writes exactly the families your account can.

## Authentication

Send the key with every request — both forms are equivalent:

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/me
curl -H 'Authorization: Bearer hb_xxxxxxxx' https://your-host/api/v1/me
```

## Scopes

| Scope | What it can do |
| --- | --- |
| `read` | every GET endpoint |
| `write` | all of the above, plus the item write endpoints in the "Write endpoints" section |

A read-only key calling a write endpoint always gets **403 `apiKey.readOnly`** — the key is valid,
it just lacks the permission. The `scope` field of `GET /api/v1/me` reports the **current key**:
one account can hold both read-only and write keys, and the permission depends only on which one
made the request.

## Choosing a family

Family-scoped endpoints default to your **default family** (your personal family first). Pass a
family id to read or write another one:

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' -H 'X-Family-Id: 3' https://your-host/api/v1/items
```

## Errors

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 401 | `apiKey.missing` | no key supplied |
| 401 | `apiKey.invalid` | unknown, revoked or expired key |
| 403 | `apiKey.readOnly` | this key is read-only and cannot write |
| 403 | `family.accessDenied` | the account is not a member of that family |
| 400 | `validation.failed` | invalid body (the response's `fields` lists the constraints) |
| 400 | `item.notEnoughStock` / `item.levelUnknown` | not enough stock / unknown pack level |
| 400 | `item.snTaken` / `item.noPackaging` | duplicate serial number / item has no pack levels |
| 404 | `item.notFound` / `location.notFound` / `scan.notFound` | no such object, or not in the current family |
| 409 | `item.barcodeTaken` / `item.traceCodeTaken` | barcode/trace code already used in this family |

## Read endpoints

### GET /api/v1/me

The account (including its avatar URL), the family and role in effect for this request, every family
the account belongs to, and the **current key's** scope and id.

```json
{
  "scope": "read-only",
  "key": { "id": 7 },
  "account": {
    "id": 1,
    "email": "me@example.com",
    "username": "olderfox",
    "takenOutAlertDays": 7,
    "avatarId": 12,
    "avatarUrl": "/api/media/1/202610/abc.png"
  },
  "family": { "id": 3, "role": "owner" },
  "families": [{ "id": 3, "name": "Home", "role": "owner", "isPersonal": true }]
}
```

### GET /api/v1/families

Every family of the account, with currency, locale, time zone, member count, item count and
location count.

### GET /api/v1/locations

The location **tree**; every node carries three counts:

```json
[
  {
    "id": 1,
    "name": "Storage room",
    "description": "East side of the basement",
    "parentId": null,
    "itemCount": 12,
    "childCount": 2,
    "unitCount": 30,
    "imageUrl": null,
    "children": []
  }
]
```

### GET /api/v1/locations/:id

A single location: `description`, parent, image, and the `breadcrumb` from the root down to it.

### GET /api/v1/items

Item list with the same filters the web UI uses:

| Parameter | Meaning |
| --- | --- |
| `q` | keyword (name, description, …) |
| `sn` | fuzzy match on serial numbers |
| `locationId` | only items in that location (children included) |
| `tagId` | only items with that tag |
| `page` | 1-based page number (default 1) |
| `pageSize` | items per page (default 20, maximum 500) |

```json
{
  "items": [
    {
      "id": 42,
      "name": "Drill",
      "quantity": 1,
      "baseUnit": "pc",
      "packLevels": [],
      "barcode": "6901234567890",
      "traceCode": null,
      "location": { "id": 1, "name": "Storage room" },
      "tags": [{ "id": 2, "name": "Tools", "color": "#0ea5e9" }],
      "unitCount": 2,
      "takenOutUnitCount": 1,
      "takenOutAt": null,
      "lostAt": null
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### GET /api/v1/items/:id

One item in full: on top of the list fields it adds `description`, `model`, `manufacturer`,
`images` (with URLs) and `units` (each serial number with its location and taken-out / lost state).

### GET /api/v1/items/:id/history

Operation history, newest first; supports `page`, `pageSize` and `targetType=item|unit|location`.

```json
{
  "items": [
    {
      "id": 901,
      "action": "item.take_out",
      "targetType": "item",
      "targetId": 42,
      "itemId": 42,
      "itemName": "Drill",
      "actorId": 1,
      "actorName": "olderfox",
      "changes": [],
      "createdAt": "2026-10-20T09:12:33.412Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

## Write endpoints

Only a key with the **write** scope may call these, and they are all **family-scoped** (same
`X-Family-Id` header). Request bodies use exactly the same fields and validation as the web UI, and
every write is recorded in the operation history with the key owner as `actorName`. The response is
the **updated item detail** (same shape as `GET /api/v1/items/:id`) unless the table says otherwise.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/v1/items/trace-code` | — | `{ "traceCode": "HB-XXXX-XXXX" }` |
| POST | `/api/v1/items` | item fields (below), optionally `units` | `{ id, name, qrToken }` |
| PATCH | `/api/v1/items/:id` | the fields to change (partial) | item detail |
| DELETE | `/api/v1/items/:id` | — | `{ "ok": true }` (soft delete) |
| POST | `/api/v1/items/:id/lost` | — | item detail (with `lostAt`) |
| DELETE | `/api/v1/items/:id/lost` | — | item detail (clears `lostAt`) |
| POST | `/api/v1/items/:id/units` | `{ sn?, locationId?, note? }` | that serial number unit |
| PATCH | `/api/v1/items/:id/units/:unitId` | `{ sn?, locationId?, note? }` | that unit |
| DELETE | `/api/v1/items/:id/units/:unitId` | — | `{ "ok": true }` |
| POST | `/api/v1/items/:id/units/:unitId/lost` | — | that unit (with `lostAt`) |
| DELETE | `/api/v1/items/:id/units/:unitId/lost` | — | that unit |
| POST | `/api/v1/items/:id/consume` | `{ level?, amount, note? }` | item detail |
| POST | `/api/v1/items/:id/restock` | `{ level?, amount, note? }` | item detail |
| POST | `/api/v1/items/:id/unpack` | `{ note? }` | item detail (history only, stock unchanged) |
| POST | `/api/v1/scan/:code/take` | — | the item/unit acted on (with `takenOutAt`) |
| POST | `/api/v1/scan/:code/return` | — | the item/unit acted on (clears `takenOutAt`) |

### Item fields

`name`, `description`, `quantity`, `price`, `model`, `manufacturer`, `barcode`, `locationId`,
`templateId`, `tagIds`, `imageIds`, `coverImageId`, `baseUnit`, `packLevels`
(`[{ "name": "box", "factor": 12 }]`); only on creation you may also pass `traceCode` and `units`
(`[{ "sn": "SN-1", "locationId": 5, "note": "…" }]`). **`traceCode` cannot be changed afterwards.**

Update an existing item (send only what changes):

```bash
curl -X PATCH \
  -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"name":"Drill","quantity":2,"locationId":5,"tagIds":[2,3]}' \
  https://your-host/api/v1/items/42
```

Stock actions count in **pack levels**; omitting `level` means the base unit:

```bash
# used up 2 pcs (base unit)
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"amount":2}' https://your-host/api/v1/items/42/consume

# restocked 1 box (factor=12, so quantity +12)
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"level":"box","amount":1}' https://your-host/api/v1/items/42/restock
```

Take out / return address an object by **code** — barcode, trace code, QR token or serial number:

```bash
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/scan/6901234567890/take
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/scan/6901234567890/return
```

## Notes

- **Deleted items never show up** in any read endpoint (deletion is soft; history is kept, and the
  barcode/serial slots stay reserved so later items cannot collide with them).
- A non-null `lostAt` means the item is marked lost; a non-null `takenOutAt` means it is currently
  taken out.
- Write permission depends **only on the key's scope**, not on the family role: a read-only key
  created by an owner still cannot write.
- Read routes are always GET (write routes live in their own controller, guarded by a source test).
