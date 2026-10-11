# Read-only API

A read-only HTTP interface for scripts, Home Assistant, backup jobs and your own dashboards.
It can read, never write.

## Create a key

**Settings → API key → New key**. The secret is shown once at creation; afterwards you only see
its prefix. Keys belong to your **account**, not to a family: a key sees exactly the families your
account can see.

## Authentication

Send the key with every request — both forms are equivalent:

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/me
curl -H 'Authorization: Bearer hb_xxxxxxxx' https://your-host/api/v1/me
```

## Choosing a family

Family-scoped endpoints default to your **default family** (your personal family first). Pass a
family id to read another one:

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' -H 'X-Family-Id: 3' https://your-host/api/v1/items
```

## Errors

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 401 | `apiKey.missing` | no key supplied |
| 401 | `apiKey.invalid` | unknown, revoked or expired key |
| 403 | `family.accessDenied` | the account is not a member of that family |
| 404 | `item.notFound` / `location.notFound` | no such object, or not in the current family |

## Endpoints

### GET /api/v1/me

The account (including its avatar URL), the family and role in effect for this request, and every
family the account belongs to.

```json
{
  "scope": "read-only",
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

## Notes

- **Deleted items never show up** in any list (deletion is soft; history is kept).
- A non-null `lostAt` means the item is marked lost; a non-null `takenOutAt` means it is currently
  taken out.
- This layer is **GET only**: use the web UI for writes, or design audit and idempotency first and
  ask for an endpoint.
