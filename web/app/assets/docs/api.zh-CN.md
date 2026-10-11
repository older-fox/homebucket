# 只读与可写 API

给脚本、Home Assistant、备份任务、自建面板用的 HTTP 接口。key 分两种权限：
**只读**（默认）只能查询；**可写物品**还能改物品、序列号与库存。

## 创建 key

**设置 → API key → 新建 key**，在名字右边选「只读」或「可写物品」。
明文只在创建时显示一次，之后只能看到前缀；**权限建好之后不能改**，要换权限就撤销重建。
key 属于**账号**而不是家庭：能看到哪些家庭、能改哪些数据，与你的账号完全一致。

## 鉴权

每个请求带上 key，两种写法等价：

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/me
curl -H 'Authorization: Bearer hb_xxxxxxxx' https://your-host/api/v1/me
```

## 权限范围

| scope | 能做什么 |
| --- | --- |
| 只读 `read` | 全部 GET 接口 |
| 可写物品 `write` | 上面全部，再加上「写接口」一节的物品写接口 |

只读 key 调写接口一律 **403 `apiKey.readOnly`** —— key 本身有效，只是没这个权限。
`GET /api/v1/me` 的 `scope` 字段会如实回报**当前这把 key** 的权限（`read-only` / `read-write`）：
同一个账号可以同时持有只读与可写 key，权限只取决于本次请求用的哪一把。

## 选择家庭

家庭级接口默认落在**默认家庭**（优先个人家庭）。要指定别的家庭就带上家庭 id：

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' -H 'X-Family-Id: 3' https://your-host/api/v1/items
```

## 错误

| HTTP | `code` | 说明 |
| --- | --- | --- |
| 401 | `apiKey.missing` | 没带 key |
| 401 | `apiKey.invalid` | key 不存在、已撤销或已过期 |
| 403 | `apiKey.readOnly` | 这把 key 是只读的，不能写 |
| 403 | `family.accessDenied` | 这个账号不在指定的家庭里 |
| 400 | `validation.failed` | 请求体不合法（响应里的 `fields` 列出字段与约束） |
| 400 | `item.notEnoughStock` / `item.levelUnknown` | 库存不足 / 不认识的包装层级 |
| 400 | `item.snTaken` / `item.noPackaging` | 序列号重复 / 该物品没配包装层级 |
| 404 | `item.notFound` / `location.notFound` / `scan.notFound` | 对象不存在，或不属于当前家庭 |
| 409 | `item.barcodeTaken` / `item.traceCodeTaken` | 条码/追溯码已被本家庭的其他物品占用 |

## 只读接口

### GET /api/v1/me

当前账号资料（含头像地址）、当前家庭与角色、账号加入的家庭列表，以及**这把 key 自己的**权限与 id。

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
  "families": [{ "id": 3, "name": "我家", "role": "owner", "isPersonal": true }]
}
```

### GET /api/v1/families

账号加入的所有家庭（含币种、语言、时区与成员数、物品数、位置数）。

### GET /api/v1/locations

位置**树**，每个节点自带三种计数：

```json
[
  {
    "id": 1,
    "name": "储藏室",
    "description": "地下室东侧",
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

单个位置：`description`、父位置、图片，以及从根到它的 `breadcrumb`。

### GET /api/v1/items

物品列表，支持与网页端同一套过滤：

| 参数 | 说明 |
| --- | --- |
| `q` | 关键词（名称、描述等） |
| `sn` | 按序列号模糊匹配 |
| `locationId` | 只看某个位置（含子位置） |
| `tagId` | 只看某个标签 |
| `page` | 第几页，从 1 开始（默认 1） |
| `pageSize` | 每页条数（默认 20，最大 500） |

```json
{
  "items": [
    {
      "id": 42,
      "name": "电钻",
      "quantity": 1,
      "baseUnit": "台",
      "packLevels": [],
      "barcode": "6901234567890",
      "traceCode": null,
      "location": { "id": 1, "name": "储藏室" },
      "tags": [{ "id": 2, "name": "工具", "color": "#0ea5e9" }],
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

单个物品详情，比列表多出 `description`、`model`、`manufacturer`、`images`（图片地址）与
`units`（每个序列号件的 `sn`、位置与取走/遗失状态）。

### GET /api/v1/items/:id/history

操作历史，倒序；支持 `page`、`pageSize`，以及 `targetType=item|unit|location`。

```json
{
  "items": [
    {
      "id": 901,
      "action": "item.take_out",
      "targetType": "item",
      "targetId": 42,
      "itemId": 42,
      "itemName": "电钻",
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

## 写接口

只对「可写物品」的 key 开放，**全部是家庭级**（同样用 `X-Family-Id` 选择家庭）。
请求体与网页端是同一套字段与校验；每个写操作都会记进操作历史，`actorName` 是 key 所属账号。
返回体默认是**更新后的物品详情**（结构同 `GET /api/v1/items/:id`），例外在下表里标出。

| 方法 | 路径 | 请求体 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/v1/items/trace-code` | — | `{ "traceCode": "HB-XXXX-XXXX" }` |
| POST | `/api/v1/items` | 物品字段（见下），可带 `units` | `{ id, name, qrToken }` |
| PATCH | `/api/v1/items/:id` | 要改的字段（部分更新） | 物品详情 |
| DELETE | `/api/v1/items/:id` | — | `{ "ok": true }`（软删除） |
| POST | `/api/v1/items/:id/lost` | — | 物品详情（带 `lostAt`） |
| DELETE | `/api/v1/items/:id/lost` | — | 物品详情（`lostAt` 清空） |
| POST | `/api/v1/items/:id/units` | `{ sn?, locationId?, note? }` | 该序列号件 |
| PATCH | `/api/v1/items/:id/units/:unitId` | `{ sn?, locationId?, note? }` | 该序列号件 |
| DELETE | `/api/v1/items/:id/units/:unitId` | — | `{ "ok": true }` |
| POST | `/api/v1/items/:id/units/:unitId/lost` | — | 该序列号件（带 `lostAt`） |
| DELETE | `/api/v1/items/:id/units/:unitId/lost` | — | 该序列号件 |
| POST | `/api/v1/items/:id/consume` | `{ level?, amount, note? }` | 物品详情 |
| POST | `/api/v1/items/:id/restock` | `{ level?, amount, note? }` | 物品详情 |
| POST | `/api/v1/items/:id/unpack` | `{ note? }` | 物品详情（只留痕，不改库存） |
| POST | `/api/v1/scan/:code/take` | — | 被操作的物品/件（带 `takenOutAt`） |
| POST | `/api/v1/scan/:code/return` | — | 被操作的物品/件（`takenOutAt` 清空） |

### 物品字段

`name`、`description`、`quantity`、`price`、`model`、`manufacturer`、`barcode`、
`locationId`、`templateId`、`tagIds`、`imageIds`、`coverImageId`、`baseUnit`、`packLevels`
（`[{ "name": "箱", "factor": 12 }]`）；只有创建时还能给 `traceCode` 和 `units`
（`[{ "sn": "SN-1", "locationId": 5, "note": "…" }]`）。**`traceCode` 创建后不可改**。

改已有物品（只传要改的字段）：

```bash
curl -X PATCH \
  -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"name":"电钻","quantity":2,"locationId":5,"tagIds":[2,3]}' \
  https://your-host/api/v1/items/42
```

库存动作按**包装层级**计数，`level` 省略就是最小单位：

```bash
# 用掉 2 台（最小单位）
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"amount":2}' https://your-host/api/v1/items/42/consume

# 补 1 箱（factor=12，所以数量 +12）
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' -H 'Content-Type: application/json' \
  -d '{"level":"箱","amount":1}' https://your-host/api/v1/items/42/restock
```

取走 / 归还按**码**定位，`code` 可以是条码、追溯码、二维码 token 或序列号：

```bash
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/scan/6901234567890/take
curl -X POST -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/scan/6901234567890/return
```

## 说明

- **已删除的物品不会出现**在任何读接口里（删除是软删除，历史记录仍保留，
  条码/序列号槽位也留着，不会与后来的物品撞车）。
- `lostAt` 非空表示标记为遗失；`takenOutAt` 非空表示当前被取走。
- 写权限**只看这把 key 的 scope**，与家庭角色无关：owner 建的只读 key 同样不能写。
- 只读路由永远是 GET（写路由单独在写控制器里，有源码护栏守着）。
