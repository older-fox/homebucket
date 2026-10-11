# 只读 API

给脚本、Home Assistant、备份任务、自建面板用的只读接口：只能读，不能改。

## 创建 key

**设置 → API key → 新建 key**。明文只在创建时显示一次，之后只能看到前缀。
key 属于**账号**而不是家庭，能看到哪些家庭与你的账号完全一致。

## 鉴权

每个请求带上 key，两种写法等价：

```bash
curl -H 'X-Api-Key: hb_xxxxxxxx' https://your-host/api/v1/me
curl -H 'Authorization: Bearer hb_xxxxxxxx' https://your-host/api/v1/me
```

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
| 403 | `family.accessDenied` | 这个账号不在指定的家庭里 |
| 404 | `item.notFound` / `location.notFound` | 对象不存在，或不属于当前家庭 |

## 接口

### GET /api/v1/me

当前账号资料（含头像地址）、当前家庭与角色、账号加入的家庭列表。

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

## 说明

- **已删除的物品不会出现**在任何列表里（删除是软删除，历史记录仍保留）。
- `lostAt` 非空表示标记为遗失；`takenOutAt` 非空表示当前被取走。
- 这一层**只有 GET**：需要写操作请用网页端，或先想清楚审计与幂等再提需求。
