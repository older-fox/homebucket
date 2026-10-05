# 翻译文件

界面文案全部放在这个目录，一个语言一个 JSON 文件。**这是唯一需要翻译的地方**——后端只返回机器可读的 `code`（例如 `location.notFound`），前端按 code 查这里的 `errors`/业务文案，查不到才回退到后端返回的中文兜底。

## 文件结构

```
locales/
├── zh-CN.json   # 主语言（基准，新增 key 先加这里）
└── en.json      # 次语言
```

每个文件按功能分区，key 用点号路径：

| 分区 | 用途 |
| --- | --- |
| `common` | 通用按钮/状态词 |
| `nav` | 侧边栏、底部 Tab |
| `auth` | 登录、注册、邀请 |
| `dashboard` | 主页统计与列表 |
| `location` | 位置树与位置详情 |
| `item` | 物品列表/详情/序列号 |
| `template` | 模板 |
| `settings` | 家庭管理、系统设置、通知器 |
| `scan` | 扫码 |
| `notifier` | 各通知器的配置字段名 |
| `event` | 通知事件名 |
| `validation` | 参数校验错误（key 名 = class-validator 约束名） |
| `errors` | 通用错误 |

占位符用 `{name}` 形式，例如 `"itemCount": "{count} 件物品"`。

## 新增一种语言

1. 复制 `en.json` 为 `<locale>.json`（例如 `ja.json`、`zh-TW.json`），Babel/BCP 47 命名；
2. 翻译 value，**不要改 key**；
3. 在 `nuxt.config.ts` 的 `i18n.locales` 里加一行：

```ts
{ code: 'ja', name: '日本語', file: 'ja.json' }
```

4. 重启 `npm run dev` 即可在设置页切换。

## 约定

- 文案里不要写死货币符号与日期格式，一律用 `Intl.NumberFormat` / `Intl.DateTimeFormat`，跟随当前语言与家庭设置的 `locale`、`currency`；
- 新增界面文案时先加 `zh-CN.json`，再补 `en.json`；
- 校验约束的中文解释放 `validation.<约束名>`（如 `minLength`、`isEmail`）。
