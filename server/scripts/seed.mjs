// 演示数据填充（可重复执行）：node scripts/seed.mjs
// 只清理并重建演示账号自己的数据，不影响其它用户。
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcryptjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../.env') });

const prisma = new PrismaClient();

const DEMO = { email: 'demo@homebucket.local', username: 'demo', password: 'homebucket123' };
const PARTNER = { email: 'family@homebucket.local', username: 'family', password: 'homebucket123' };

const token = (bytes = 9) => randomBytes(bytes).toString('hex');
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** 位置树：[名称, 描述, 子节点[]] */
const TREE = [
  ['家', '所有收纳位置的根节点', [
    ['客厅', '日常活动区', [['电视柜', '影音设备与线材'], ['沙发边柜', '随手收纳']]],
    ['厨房', '厨具与食材', [['吊柜', '干货、餐具、备用耗材'], ['冰箱', '生鲜与饮品']]],
    ['卧室', '衣物与寝具', [['衣柜', '当季衣物'], ['床下收纳', '被褥与换季衣物']]],
    ['书房', '办公与电子设备', [['书桌抽屉', '常用数码配件'], ['文件柜', '重要文件与贵重物品']]],
    ['储藏室', '大件与季节性物品', [['货架 A', '工具与五金'], ['货架 B', '露营与杂项']]],
  ]],
];

const TAGS = [
  ['电子', '#3b82f6'],
  ['工具', '#f59e0b'],
  ['厨房', '#22c55e'],
  ['贵重', '#ef4444'],
  ['季节性', '#8b5cf6'],
  ['线材', '#14b8a6'],
  ['备用', '#64748b'],
  ['待处理', '#ec4899'],
];

/** [名称, 数量, 单价, 型号, 制造商, 位置, 标签[], 描述] */
const ITEMS = [
  ['移动电源', 2, 199, 'PowerCore 20000', 'Anker', '书桌抽屉', ['电子', '备用'], '20000mAh，支持 PD 快充'],
  ['HDMI 线', 4, 29, '2.1 版 2m', '绿联', '文件柜', ['线材', '备用'], '支持 4K120Hz'],
  ['USB-C 数据线', 6, 15, '100W 1.5m', '绿联', '书桌抽屉', ['线材', '备用'], '编织线，支持 100W 快充'],
  ['无线鼠标', 1, 129, 'MX Master 3S', '罗技', '书桌抽屉', ['电子'], '办公主力鼠标'],
  ['机械键盘', 1, 499, 'K8 Pro 87 键', '京东京造', '书桌抽屉', ['电子'], '茶轴，蓝牙双模'],
  ['路由器', 1, 399, 'AX3000', '小米', '电视柜', ['电子'], '客厅主路由'],
  ['智能音箱', 2, 299, '小爱音箱 Pro', '小米', '客厅', ['电子'], '语音助手 + 红外遥控'],
  ['电钻', 1, 399, 'GSB 120-LI', '博世', '货架 A', ['工具'], '12V 锂电钻'],
  ['螺丝刀套装', 1, 89, '24 合 1', '小米', '货架 A', ['工具'], '精密批头'],
  ['卷尺', 2, 25, '5 米', '得力', '货架 A', ['工具'], '自锁卷尺'],
  ['家用工具箱', 1, 159, '38 件套', '得力', '货架 A', ['工具'], '锤子、钳子、扳手'],
  ['透明胶带', 5, 8, '48mm', '3M', '货架 B', ['备用'], '封箱用'],
  ['LED 灯泡', 8, 19, 'E27 9W 暖白', '飞利浦', '吊柜', ['备用'], '客厅备用灯泡'],
  ['5 号电池', 24, 3, '碱性', '南孚', '吊柜', ['备用'], '聚能环 4 代'],
  ['7 号电池', 12, 3, '碱性', '南孚', '吊柜', ['备用'], '遥控器用'],
  ['电饭煲', 1, 399, 'IH 4L', '美的', '厨房', ['厨房'], 'IH 电磁加热'],
  ['电水壶', 1, 149, '1.7L 保温', '美的', '厨房', ['厨房'], '316 不锈钢内胆'],
  ['保温杯', 3, 99, '500ml', '膳魔师', '吊柜', ['厨房'], '办公室/家里各一个'],
  ['锅具套装', 1, 599, '不粘三件套', '苏泊尔', '吊柜', ['厨房'], '炒锅 + 汤锅 + 奶锅'],
  ['保鲜盒', 12, 12, '玻璃套装', '乐扣乐扣', '吊柜', ['厨房'], '可微波加热'],
  ['无线吸尘器', 1, 1299, 'V12 Detect', '追觅', '储藏室', ['电子'], '带激光探测'],
  ['扫地机器人', 1, 2499, 'T30 Pro', '石头', '客厅', ['电子', '贵重'], '免手洗基站'],
  ['空气净化器', 1, 1499, '米家 4 Pro', '小米', '卧室', ['电子'], '除甲醛版'],
  ['加湿器', 1, 399, '6L 上加水', '小米', '卧室', ['电子'], '卧室夜间使用'],
  ['落地风扇', 2, 299, '7 叶静音', '美的', '储藏室', ['季节性'], '换季收纳'],
  ['电热毯', 1, 199, '双人 1.8m', '南极人', '床下收纳', ['季节性'], '冬季用品'],
  ['羽绒服', 2, 899, 'L 码', '优衣库', '衣柜', ['季节性'], '冬季外套'],
  ['四件套', 3, 299, '1.8m 床', '富安娜', '衣柜', ['备用'], '换洗床品'],
  ['被褥收纳袋', 4, 35, '大号 90L', '太力', '床下收纳', ['备用'], '真空压缩'],
  ['行李箱', 1, 799, '24 寸铝框', '小米', '床下收纳', ['贵重'], '出差用'],
  ['登山帐篷', 1, 1299, '冷山 2 人', '牧高笛', '货架 B', ['季节性'], '露营装备'],
  ['露营灯', 2, 99, '营地灯', '牧高笛', '货架 B', ['季节性'], '可当充电宝'],
  ['证件收纳包', 1, 59, 'A5 多隔层', '得力', '文件柜', ['贵重'], '护照、证件、票据'],
  ['微单相机', 1, 6999, 'A7C II', '索尼', '文件柜', ['贵重', '电子'], '全画幅微单'],
  ['定焦镜头', 2, 3999, 'FE 35mm F1.8', '索尼', '文件柜', ['贵重'], '日常挂机头'],
  ['三脚架', 1, 699, '碳纤维', '曼富图', '储藏室', ['工具'], '轻量旅行脚架'],
];

/** 演示「同一物品的 SN 分散在不同位置」：物品名 → [sn, 位置名][] */
const UNITS = {
  移动电源: [['PB-2024-001', '书桌抽屉'], ['PB-2024-002', '沙发边柜']],
  电钻: [['DRILL-8812', '货架 A']],
  微单相机: [['CAM-77A21', '文件柜']],
  扫地机器人: [['ROBOT-3301', '客厅']],
  落地风扇: [['FAN-01', '储藏室'], ['FAN-02', '卧室']],
  保温杯: [['CUP-01', '吊柜'], ['CUP-02', '书桌抽屉'], ['CUP-03', '吊柜']],
};

const TEMPLATES = [
  ['5 号电池', '一次性备用耗材，用完即买', 8, 3, '碱性', '南孚', '吊柜', ['备用']],
  ['LED 灯泡', '客厅与卧室通用', 4, 19, 'E27 9W', '飞利浦', '吊柜', ['备用']],
  ['USB-C 数据线', '常用损耗品', 2, 15, '100W 1.5m', '绿联', '书桌抽屉', ['线材']],
  ['收纳箱', '换季收纳通用', 3, 45, '55L', '太力', '床下收纳', ['备用']],
];

async function cleanupUser(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;

  const owned = await prisma.family.findMany({ where: { ownerId: user.id }, select: { id: true } });
  if (owned.length) {
    await prisma.family.deleteMany({ where: { id: { in: owned.map((family) => family.id) } } });
  }
  await prisma.familyMember.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { defaultFamilyId: null } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`  · 清理旧账号 ${email}`);
}

async function buildTree(familyId, nodes, parentId = null) {
  const map = new Map();
  let index = 0;

  for (const [name, description, children] of nodes) {
    const location = await prisma.location.create({
      data: {
        familyId,
        parentId,
        name,
        description,
        sortIndex: index,
        qrToken: token(),
      },
      select: { id: true },
    });
    index += 1;
    map.set(name, location.id);
    if (children?.length) {
      const childMap = await buildTree(familyId, children, location.id);
      for (const [key, value] of childMap) map.set(key, value);
    }
  }

  return map;
}

async function main() {
  console.log('清理旧演示数据…');
  await cleanupUser(DEMO.email);
  await cleanupUser(PARTNER.email);

  console.log('创建演示账号…');
  const demo = await prisma.user.create({
    data: {
      email: DEMO.email,
      username: DEMO.username,
      passwordHash: await hash(DEMO.password, 10),
      locale: 'zh-CN',
    },
  });
  const partner = await prisma.user.create({
    data: {
      email: PARTNER.email,
      username: PARTNER.username,
      passwordHash: await hash(PARTNER.password, 10),
      locale: 'zh-CN',
    },
  });

  // 个人家庭
  const personal = await prisma.family.create({
    data: {
      name: `${DEMO.username} 的家`,
      isPersonal: true,
      currency: 'CNY',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      ownerId: demo.id,
      members: { create: { userId: demo.id, role: 'owner' } },
    },
  });
  await prisma.user.update({ where: { id: demo.id }, data: { defaultFamilyId: personal.id } });

  // 共享家庭（演示多家庭、成员与邀请）
  const shared = await prisma.family.create({
    data: {
      name: '样板间',
      isPersonal: false,
      currency: 'CNY',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      ownerId: demo.id,
      members: {
        create: [
          { userId: demo.id, role: 'owner' },
          { userId: partner.id, role: 'member' },
        ],
      },
    },
  });
  await prisma.user.update({ where: { id: demo.id }, data: { defaultFamilyId: shared.id } });
  await prisma.user.update({ where: { id: partner.id }, data: { defaultFamilyId: shared.id } });

  // 演示用邀请链接
  await prisma.familyInvite.create({
    data: { familyId: shared.id, createdById: demo.id, token: token(16), expiresAt: daysAgo(-30) },
  });

  console.log('创建位置树…');
  const locations = await buildTree(shared.id, TREE);
  const locationId = (name) => locations.get(name);

  console.log('创建标签…');
  const tags = new Map();
  for (const [name, color] of TAGS) {
    const tag = await prisma.tag.create({ data: { familyId: shared.id, name, color }, select: { id: true } });
    tags.set(name, tag.id);
  }

  console.log('创建物品…');
  let created = 0;
  for (const [index, row] of ITEMS.entries()) {
    const [name, quantity, price, model, manufacturer, place, tagNames, description] = row;
    const item = await prisma.item.create({
      data: {
        familyId: shared.id,
        name,
        description,
        quantity,
        price,
        model,
        manufacturer,
        locationId: locationId(place),
        qrToken: token(),
        createdAt: daysAgo(index % 30),
        tags: tagNames?.length ? { connect: tagNames.map((tag) => ({ id: tags.get(tag) })) } : undefined,
      },
      select: { id: true },
    });

    const units = UNITS[name];
    if (units) {
      for (const [sn, unitPlace] of units) {
        await prisma.itemUnit.create({
          data: {
            familyId: shared.id,
            itemId: item.id,
            sn,
            locationId: locationId(unitPlace),
            note: unitPlace,
          },
        });
      }
    }
    created += 1;
  }

  console.log('创建模板…');
  for (const [name, description, quantity, price, model, manufacturer, place, tagNames] of TEMPLATES) {
    await prisma.template.create({
      data: {
        familyId: shared.id,
        name,
        description,
        quantity,
        price,
        model,
        manufacturer,
        defaultLocationId: locationId(place),
        tags: tagNames?.length ? { connect: tagNames.map((tag) => ({ id: tags.get(tag) })) } : undefined,
      },
    });
  }

  console.log('创建通知器（未启用，仅演示）…');
  await prisma.notificationChannel.create({
    data: {
      familyId: shared.id,
      type: 'bark',
      name: '演示 Bark',
      enabled: false,
      events: 'item_created',
      config: JSON.stringify({ serverKey: 'demo-key', serverUrl: 'https://api.day.app' }),
    },
  });

  const counts = {
    位置: await prisma.location.count({ where: { familyId: shared.id } }),
    标签: await prisma.tag.count({ where: { familyId: shared.id } }),
    物品: created,
    序列号: await prisma.itemUnit.count({ where: { familyId: shared.id } }),
    模板: await prisma.template.count({ where: { familyId: shared.id } }),
  };

  console.log('\n完成 ✓');
  console.log('演示账号：');
  console.log(`  邮箱 ${DEMO.email}   密码 ${DEMO.password}   （默认家庭：样板间）`);
  console.log(`  邮箱 ${PARTNER.email}  密码 ${PARTNER.password} （样板间的普通成员）`);
  console.log('数据量：', counts);
}

main()
  .catch((error) => {
    console.error('填充失败：', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
