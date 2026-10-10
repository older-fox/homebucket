#!/usr/bin/env node
// 演示/测试数据填充（可重复执行）：npm run build && npm run seed
// 数据全部归属 .env 中 DEFAULT_ADMIN_* 指定的账号；只清理该账号自己的旧数据，不影响其它用户。
//
// ⚠️ 需要先 `npm run build`：本脚本跑的是编译产物（dist/），和 scripts/db-baseline.mjs 同一套路。
//    这样它既能用在开发机，也能直接用在只装了生产依赖的容器里（不必带 ts-node 与源码）。
//    加载顺序有讲究：**必须先 loadEnv 再 require dist**，因为 data-source.js 在模块顶层
//    就会读 process.env 组装连接串并 new DataSource(...)。
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcryptjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../.env') });

const require = createRequire(import.meta.url);
// DataSource 用 dist 里的 default 导出（唯一导出，见 data-source.ts 的说明）
const dataSource = require(resolve(root, 'dist/database/data-source.js')).default;
// 实体清单同样从编译产物取，保证和运行时是同一份
const {
  Attachment,
  Family,
  FamilyInvite,
  FamilyMember,
  Item,
  ItemUnit,
  Location,
  NotificationChannel,
  Tag,
  Template,
  User,
} = require(resolve(root, 'dist/entities/index.js'));
// where 里的 in / is null / not null 一律用 TypeORM 操作符：
// 1.x 的 invalidWhereValuesBehavior 默认 "throw"，裸 null / undefined 会直接抛错
const { In, IsNull, Not } = require('typeorm');
// 共享 helper：qrToken / 邀请 token 用的就是短随机串，别在这里再抄一遍 randomBytes
const { shortToken } = require(resolve(root, 'dist/common/id.js'));

const ADMIN = {
  email: (process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
  username: (process.env.DEFAULT_ADMIN_USERNAME || 'admin').trim(),
  password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin',
};
const PARTNER = { email: 'family@homebucket.local', username: 'family', password: 'homebucket123' };
const KID = { email: 'kid@homebucket.local', username: 'kid', password: 'homebucket123' };

// 随机串统一走 common/id.ts 的 shortToken（它就是原来的 randomBytes(bytes).toString('hex')）
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const uploadDir = resolve(
  root,
  process.env.UPLOAD_DIR?.trim() || `${process.env.DATA_DIR?.trim() || 'data'}/uploads`,
);

// ---------------------------------------------------------------- 位置树
const TREE = [
  ['家', '所有收纳位置的根节点', [
    ['玄关', '进门随手收纳', [['鞋柜', '当季鞋'], ['鞋盒收纳', '换季鞋盒']]],
    ['客厅', '日常活动区', [['电视柜', '影音与线材'], ['沙发边柜', '随手收纳'], ['阳台柜', '清洁与晾晒']]],
    ['阳台', '半室外空间', [['园艺架', '花盆与工具']]],
    ['厨房', '烹饪与食材', [['吊柜', '餐具与耗材'], ['调料柜', '调味品'], ['冰箱', '生鲜与饮品'], ['水槽下柜', '清洁用品']]],
    ['餐厅', '用餐区', [['餐边柜', '酒水与杯具']]],
    ['主卧', '休息与衣物', [['衣柜', '当季衣物'], ['床下收纳', '被褥换季'], ['床头柜', '随身小物']]],
    ['儿童房', '孩子的空间', [['玩具箱', '玩具'], ['书桌抽屉', '文具']]],
    ['书房', '办公与数码', [['书桌抽屉', '常用配件'], ['文件柜', '证件与贵重'], ['书架', '书籍与资料']]],
    ['卫生间', '洗漱与清洁', [['镜柜', '洗漱用品'], ['洗衣机旁收纳', '洗涤耗材']]],
    ['储藏室', '大件与季节物品', [['货架 A', '工具五金'], ['货架 B', '露营运动'], ['货架 C', '备用耗材'], ['塑料收纳箱', '杂项']]],
    ['车库', '车辆与维修', [['工具柜', '车用工具'], ['轮胎架', '轮胎与配件']]],
    ['阁楼', '长期存放', [['纸箱区', '纪念与长期存放']]],
  ]],
];

// ---------------------------------------------------------------- 标签
const TAGS = [
  ['电子', '#3b82f6'], ['工具', '#f59e0b'], ['厨房', '#22c55e'], ['清洁', '#06b6d4'],
  ['贵重', '#ef4444'], ['季节性', '#8b5cf6'], ['线材', '#14b8a6'], ['备用', '#64748b'],
  ['待处理', '#ec4899'], ['儿童', '#a855f7'], ['运动', '#0ea5e9'], ['露营', '#65a30d'],
  ['宠物', '#d97706'], ['药品', '#dc2626'], ['文具', '#7c3aed'], ['礼品', '#e11d48'],
  ['安全', '#b91c1c'],
];

// ---------------------------------------------------------------- 物品目录（按位置分组；组名=树中的位置名，重名处用完整路径）
// [名称, 数量, 单价, 型号, 制造商, 标签[], 描述]
const CATALOG = {
  鞋柜: [
    ['运动鞋', 3, 599, '43 码', 'Nike', ['运动'], '日常跑步'],
    ['皮鞋', 1, 899, '42 码 黑色', 'Clarks', ['备用'], '正式场合'],
    ['拖鞋', 4, 39, 'EVA 防滑', '网易严选', ['备用'], '客用'],
    ['鞋拔子', 2, 15, '长柄', '无印良品', ['备用'], null],
    ['口罩', 3, 39, '50 只装', '稳健', ['备用'], '日常防护'],
    ['雨伞', 3, 59, '折叠自动', '天堂伞', ['备用'], '玄关常备'],
  ],
  鞋盒收纳: [
    ['鞋盒', 12, 12, '透明可叠', '天马', ['备用'], '换季鞋收纳'],
    ['鞋油套装', 1, 45, '无色', '皇宇', ['备用', '待处理'], '皮鞋保养'],
  ],
  电视柜: [
    ['路由器', 1, 399, 'AX3000', '小米', ['电子'], '客厅主路由'],
    ['机顶盒', 1, 299, '4K', '创维', ['电子'], '客厅'],
    ['扫地机器人', 1, 2499, 'T30 Pro', '石头', ['电子', '贵重'], '免手洗基站'],
    ['HDMI 线', 4, 29, '2.1 版 2m', '绿联', ['线材', '备用'], '支持 4K120Hz'],
    ['游戏手柄', 2, 349, '无线', '微软', ['电子'], 'Xbox 手柄'],
    ['插线板', 3, 79, '6 位 3m', '公牛', ['备用'], '带过载保护'],
    ['电视遥控器', 2, 39, '语音版', '小米', ['电子', '备用'], '含备用'],
  ],
  沙发边柜: [
    ['抽纸', 6, 25, '3 层 130 抽', '维达', ['备用'], '客厅常备'],
    ['湿巾', 4, 18, '80 抽', '心相印', ['备用'], null],
    ['充电宝', 2, 199, 'PowerCore 20000', 'Anker', ['电子'], '20000mAh 快充'],
    ['扑克牌', 2, 15, '塑料', '姚记', ['备用'], '家庭娱乐'],
  ],
  阳台柜: [
    ['洗衣液', 3, 59, '3kg 薰衣草', '蓝月亮', ['清洁'], null],
    ['晾衣夹', 40, 0.5, '不锈钢', '茶花', ['备用'], '散装'],
    ['衣架', 30, 2, '防滑', '茶花', ['备用'], null],
    ['折叠晾衣架', 1, 219, '落地', '好太太', ['备用', '季节性'], '晒被用'],
  ],
  园艺架: [
    ['花盆', 6, 29, '陶瓷 15cm', '宜家', ['备用'], null],
    ['园艺工具', 1, 99, '三件套', '得力', ['工具'], '铲/剪/耙'],
    ['营养土', 2, 25, '10L', '美乐棵', ['备用'], null],
    ['浇花壶', 1, 45, '1.5L', '宜家', ['备用'], null],
  ],
  吊柜: [
    ['LED 灯泡', 8, 19, 'E27 9W 暖白', '飞利浦', ['备用'], '全屋备用'],
    ['5 号电池', 24, 3, '碱性', '南孚', ['备用'], '聚能环 4 代'],
    ['7 号电池', 12, 3, '碱性', '南孚', ['备用'], '遥控器用'],
    ['保温杯', 3, 99, '500ml', '膳魔师', ['厨房'], '办公室/家里各一个'],
    ['锅具套装', 1, 599, '不粘三件套', '苏泊尔', ['厨房'], '炒锅+汤锅+奶锅'],
    ['保鲜盒', 12, 12, '玻璃套装', '乐扣乐扣', ['厨房'], '可微波'],
    ['保鲜膜', 3, 15, '30cm', '妙洁', ['厨房', '备用'], null],
    ['垃圾袋', 5, 12, '中号 90 只', '妙洁', ['清洁', '备用'], null],
  ],
  调料柜: [
    ['酱油', 2, 18, '特级 500ml', '海天', ['厨房'], null],
    ['食用油', 2, 79, '5L 压榨', '金龙鱼', ['厨房'], null],
    ['食盐', 3, 3, '加碘 400g', '中盐', ['厨房'], null],
    ['花椒', 1, 15, '50g', '王守义', ['厨房'], null],
    ['白砂糖', 1, 9, '400g', '太古', ['厨房'], null],
  ],
  冰箱: [
    ['牛奶', 6, 15, '1L 全脂', '伊利', ['厨房'], '注意保质期'],
    ['鸡蛋', 30, 1.5, '散养', '本地农场', ['厨房'], null],
    ['冻饺子', 3, 29, '500g', '三全', ['厨房'], null],
    ['冰淇淋', 4, 25, '家庭装', '梦龙', ['厨房'], null],
  ],
  水槽下柜: [
    ['洗洁精', 3, 19, '1kg', '立白', ['清洁'], null],
    ['洗碗海绵', 10, 3, '双面', '3M', ['清洁', '备用'], null],
    ['厨房清洁剂', 2, 29, '去油污', '威猛先生', ['清洁'], null],
    ['垃圾桶', 1, 89, '感应式 12L', '拓牛', ['清洁'], '厨房用'],
    ['猫粮', 2, 199, '5kg 成猫', '皇家', ['宠物'], '宠物月度口粮'],
  ],
  餐边柜: [
    ['红酒杯', 6, 59, '水晶', '青苹果', ['厨房'], '客用'],
    ['茶叶', 4, 128, '龙井 250g', '卢正浩', ['厨房', '礼品'], '送礼用'],
    ['咖啡豆', 2, 89, '中深烘 500g', '三顿半', ['厨房'], '手冲'],
    ['开瓶器', 2, 25, '多功能', '双立人', ['厨房'], null],
  ],
  衣柜: [
    ['羽绒服', 2, 899, 'L 码', '优衣库', ['季节性'], '冬季外套'],
    ['衬衫', 6, 229, '39 白色', '优衣库', ['备用'], '通勤'],
    ['牛仔裤', 3, 399, '32 码', "Levi's", ['备用'], null],
    ['毛衣', 4, 399, 'M 码 灰色', '无印良品', ['季节性'], null],
    ['西装', 1, 1999, '48 码', '雅戈尔', ['贵重'], '正式场合'],
    ['围巾', 3, 129, '羊毛', '优衣库', ['季节性'], null],
  ],
  床下收纳: [
    ['四件套', 3, 299, '1.8m 床', '富安娜', ['备用'], '换洗床品'],
    ['被褥收纳袋', 4, 35, '大号 90L', '太力', ['备用'], '真空压缩'],
    ['电热毯', 1, 199, '双人 1.8m', '南极人', ['季节性'], '冬季用品'],
    ['行李箱', 1, 799, '24 寸铝框', '小米', ['贵重'], '出差用'],
    ['换季被芯', 2, 599, '冬被 6 斤', '水星家纺', ['季节性'], null],
  ],
  床头柜: [
    ['眼罩', 2, 39, '真丝', '南极人', ['备用'], null],
    ['耳塞', 1, 29, '隔音', '3M', ['备用'], null],
    ['睡前读物', 4, 59, '小说', '人民文学', ['文具'], '睡前看'],
    ['加湿器', 1, 399, '6L 上加水', '小米', ['电子'], '卧室夜间使用'],
  ],
  玩具箱: [
    ['乐高积木', 3, 399, '城市系列', 'LEGO', ['儿童'], null],
    ['拼图', 4, 79, '100 片', 'TOI', ['儿童'], null],
    ['玩偶', 6, 59, '毛绒', '迪士尼', ['儿童'], null],
    ['遥控车', 2, 199, '越野', '小米', ['儿童', '电子'], null],
    ['画笔画板', 1, 129, '双面磁性', '得力', ['儿童', '文具'], null],
  ],
  '儿童房/书桌抽屉': [
    ['水彩笔', 3, 39, '24 色', '晨光', ['文具', '儿童'], null],
    ['铅笔', 20, 1, 'HB', '中华', ['文具'], null],
    ['橡皮', 10, 2, '4B', '晨光', ['文具'], null],
    ['作业本', 12, 3, '田字格', '得力', ['文具', '儿童'], null],
  ],
  '书房/书桌抽屉': [
    ['无线鼠标', 1, 129, 'MX Master 3S', '罗技', ['电子'], '办公主力'],
    ['机械键盘', 1, 499, 'K8 Pro 87 键', '京东京造', ['电子'], '茶轴蓝牙双模'],
    ['USB-C 数据线', 6, 15, '100W 1.5m', '绿联', ['线材', '备用'], '编织线'],
    ['无线充电器', 2, 99, '15W', '小米', ['电子'], null],
    ['U 盘', 3, 59, '64GB', '闪迪', ['电子', '备用'], null],
    ['显示器支架', 1, 199, '气压式', '爱格升', ['电子'], null],
    ['TYPE-C 扩展坞', 1, 299, '7 合 1', '绿联', ['电子'], null],
  ],
  文件柜: [
    ['证件收纳包', 1, 59, 'A5 多隔层', '得力', ['贵重'], '护照/证件/票据'],
    ['微单相机', 1, 6999, 'A7C II', '索尼', ['贵重', '电子'], '全画幅微单'],
    ['定焦镜头', 2, 3999, 'FE 35mm F1.8', '索尼', ['贵重'], '日常挂机头'],
    ['移动硬盘', 1, 599, '2TB', '西部数据', ['电子', '贵重'], '备份照片'],
    ['合同文件', 1, 0, 'A4 档案盒', '得力', ['贵重'], '重要资料'],
    ['备用钥匙', 2, 0, '房门', '—', ['贵重'], '含父母家钥匙'],
  ],
  书架: [
    ['技术书', 12, 79, '计算机', '图灵', ['文具'], null],
    ['文学书', 10, 45, '小说', '人民文学', ['文具'], null],
    ['笔记本', 5, 25, 'A5 网格', '无印良品', ['文具', '备用'], null],
    ['相册', 2, 129, '布面', '—', ['礼品'], '家庭照片'],
    ['A4 打印纸', 2, 39, '70g 500 张', '得力', ['文具', '备用'], '办公耗材'],
  ],
  镜柜: [
    ['牙刷头', 4, 39, '电动替换', '飞利浦', ['备用'], null],
    ['洗发水', 2, 69, '去屑 750ml', '海飞丝', ['清洁'], null],
    ['沐浴露', 2, 59, '1L', '多芬', ['清洁'], null],
    ['面膜', 10, 15, '补水', '森田', ['备用'], null],
    ['急救药品箱', 1, 89, '套装', '云南白药', ['药品'], '创可贴/碘伏'],
    ['维生素', 3, 129, '复合 60 片', '善存', ['药品'], null],
  ],
  洗衣机旁收纳: [
    ['洗衣凝珠', 2, 69, '60 颗', '奥妙', ['清洁'], '月度耗材'],
    ['衣物柔顺剂', 2, 39, '1L', '金纺', ['清洁'], null],
    ['除螨喷雾', 1, 49, '500ml', '安速', ['清洁'], null],
    ['晾衣网', 2, 25, '双层', '茶花', ['备用'], null],
  ],
  '储藏室/货架 A': [
    ['电钻', 1, 399, 'GSB 120-LI', '博世', ['工具'], '12V 锂电钻'],
    ['螺丝刀套装', 1, 89, '24 合 1', '小米', ['工具'], '精密批头'],
    ['卷尺', 2, 25, '5 米', '得力', ['工具'], null],
    ['家用工具箱', 1, 159, '38 件套', '得力', ['工具'], '锤/钳/扳手'],
    ['胶枪', 1, 79, '热熔', '得力', ['工具'], null],
    ['水平尺', 1, 45, '60cm', '长城精工', ['工具'], null],
    ['活动扳手', 2, 59, '250mm', '世达', ['工具'], null],
    ['绝缘胶带', 5, 8, '18mm', '3M', ['工具', '备用'], null],
  ],
  '储藏室/货架 B': [
    ['登山帐篷', 1, 1299, '冷山 2 人', '牧高笛', ['露营', '季节性'], '露营装备'],
    ['折叠椅', 2, 199, '月亮椅', '牧高笛', ['露营'], null],
    ['露营灯', 2, 99, '充电营地灯', '牧高笛', ['露营'], '可当充电宝'],
    ['睡袋', 2, 399, '信封式 0℃', '黑冰', ['露营', '季节性'], null],
    ['登山杖', 2, 159, '碳纤维', '牧高笛', ['运动'], null],
    ['登山袜', 3, 79, '羊毛', '迪卡侬', ['运动', '露营'], null],
    ['瑜伽垫', 2, 129, 'TPE 8mm', '李宁', ['运动'], null],
    ['哑铃', 2, 199, '可调 10kg', '迪卡侬', ['运动'], null],
    ['跳绳', 1, 39, '钢丝', '迪卡侬', ['运动'], null],
    ['羽毛球拍', 2, 399, '全碳', '尤尼克斯', ['运动'], null],
  ],
  '储藏室/货架 C': [
    ['透明胶带', 5, 8, '48mm', '3M', ['备用'], '封箱用'],
    ['双面胶', 6, 6, '强力', '3M', ['备用'], null],
    ['扎带', 100, 0.2, '尼龙', '得力', ['备用'], '散装'],
    ['收纳箱', 4, 45, '55L', '太力', ['备用'], null],
    ['挂钩', 20, 3, '承重 5kg', '3M', ['备用'], null],
    ['纸箱', 10, 5, '五层加厚', '—', ['备用'], '搬家备用'],
    ['气泡膜', 1, 35, '50cm×50m', '—', ['备用'], null],
    ['落地风扇', 2, 299, '7 叶静音', '美的', ['季节性'], '换季收纳'],
  ],
  塑料收纳箱: [
    ['圣诞装饰', 1, 199, '套装', '宜家', ['礼品', '季节性'], '每年 12 月用'],
    ['纪念品', 1, 0, '杂项', '—', ['礼品'], '旅行带回'],
    ['旧手机', 3, 0, '退役机', '—', ['电子', '待处理'], '待回收'],
    ['旧路由器', 2, 0, '退役机', '—', ['电子', '待处理'], '待回收'],
    ['充电器', 6, 29, '各种接口', '—', ['线材', '备用'], '杂物'],
  ],
  工具柜: [
    ['千斤顶', 1, 199, '3T 卧式', '通润', ['工具'], '车用'],
    ['车载充气泵', 1, 189, '数显', '小米', ['工具'], null],
    ['搭电线', 1, 129, '3 米加粗', '—', ['工具'], '应急'],
    ['灭火器', 1, 89, '1kg 干粉', '江荆', ['安全'], '车库/车内'],
    ['玻璃水', 3, 25, '2L -25℃', '蓝星', ['备用'], null],
    ['机油', 1, 299, '5W-30 4L', '美孚', ['备用'], '保养备用'],
  ],
  轮胎架: [
    ['雪地胎', 4, 899, '215/55 R17', '米其林', ['季节性'], '冬季更换'],
    ['备胎', 1, 0, '原厂', '—', ['备用'], null],
  ],
  纸箱区: [
    ['婴儿纪念品', 1, 0, '纪念', '—', ['礼品', '儿童'], '留存'],
    ['毕业相册', 1, 0, '—', '—', ['礼品'], null],
    ['旧笔记本', 5, 0, '退役', '—', ['文具', '待处理'], '含旧资料'],
  ],
};

/** 组名 → 树中完整路径（重名位置在 CATALOG 里已写全路径，这里只做兜底匹配） */
const GROUP_ALIAS = {
  货架A: '储藏室/货架 A',
  货架B: '储藏室/货架 B',
  货架C: '储藏室/货架 C',
};

// 同一物品的 SN 分散在不同位置
const UNITS = {
  充电宝: [['PB-2024-001', '客厅/沙发边柜'], ['PB-2024-002', '书房/书桌抽屉']],
  电钻: [['DRILL-8812', '储藏室/货架 A']],
  微单相机: [['CAM-77A21', '书房/文件柜']],
  定焦镜头: [['LENS-35-001', '书房/文件柜'], ['LENS-35-002', '阁楼/纸箱区']],
  保温杯: [['CUP-01', '厨房/吊柜'], ['CUP-02', '书房/书桌抽屉'], ['CUP-03', '厨房/吊柜']],
  移动硬盘: [['HDD-2TB-01', '书房/文件柜']],
  折叠椅: [['CHAIR-01', '储藏室/货架 B'], ['CHAIR-02', '车库/工具柜']],
  睡袋: [['BAG-01', '储藏室/货架 B'], ['BAG-02', '阁楼/纸箱区']],
  灭火器: [['FE-001', '车库/工具柜']],
  扫地机器人: [['ROBOT-3301', '客厅/电视柜']],
  落地风扇: [['FAN-01', '储藏室/货架 C'], ['FAN-02', '主卧/床下收纳']],
  瑜伽垫: [['YOG-01', '储藏室/货架 B'], ['YOG-02', '儿童房/玩具箱']],
};

// 部分物品的商品条码（EAN-13），用于演示条码追踪
const BARCODES = {
  路由器: '6901234567892',
  'HDMI 线': '6902345678901',
  'USB-C 数据线': '6903456789010',
  机械键盘: '6904567890129',
  无线鼠标: '6905678901238',
  微单相机: '6906789012347',
  定焦镜头: '6907890123456',
  移动硬盘: '6908901234565',
  保温杯: '6909012345674',
  '5 号电池': '6900123456783',
  'LED 灯泡': '6901111122222',
  洗衣液: '6902222233333',
  维生素: '6903333344444',
  睡袋: '6904444455555',
};

/**
 * 多级包装示例：库存仍按最小单位存，界面自动换算成「X 箱 Y 板 Z 节」。
 * 只在演示数据里给几样常用耗材配上，用来验证换算与消耗。
 */
const PACKAGING = {
  抽纸: { baseUnit: '包', packLevels: [{ name: '提', factor: 6 }] },
  '5 号电池': {
    baseUnit: '节',
    packLevels: [
      { name: '板', factor: 4 },
      { name: '盒', factor: 24 },
    ],
  },
  牛奶: { baseUnit: '盒', packLevels: [{ name: '箱', factor: 6 }] },
};

// ---------------------------------------------------------------- 模板
const TEMPLATES = [
  ['5 号电池', '一次性备用耗材，用完即买', 8, 3, '碱性', '南孚', '厨房/吊柜', ['备用']],
  ['LED 灯泡', '全屋通用', 4, 19, 'E27 9W 暖白', '飞利浦', '厨房/吊柜', ['备用']],
  ['USB-C 数据线', '常用损耗品', 2, 15, '100W 1.5m', '绿联', '书房/书桌抽屉', ['线材']],
  ['收纳箱', '换季收纳通用', 3, 45, '55L', '太力', '储藏室/货架 C', ['备用']],
  ['抽纸', '客厅/卧室常备', 6, 25, '3 层 130 抽', '维达', '客厅/沙发边柜', ['备用']],
  ['垃圾袋', '厨房常用', 5, 12, '中号 90 只', '妙洁', '厨房/吊柜', ['清洁']],
  ['保鲜盒', '厨房收纳', 6, 12, '玻璃套装', '乐扣乐扣', '厨房/吊柜', ['厨房']],
  ['洗衣凝珠', '月度耗材', 2, 69, '60 颗', '奥妙', '卫生间/洗衣机旁收纳', ['清洁']],
  ['创可贴', '家庭急救', 2, 15, '防水 100 片', '云南白药', '卫生间/镜柜', ['药品']],
  ['A4 打印纸', '办公耗材', 2, 39, '70g 500 张', '得力', '书房/书架', ['文具']],
  ['登山袜', '户外常备', 3, 79, '羊毛', '迪卡侬', '储藏室/货架 B', ['运动', '露营']],
  ['猫粮', '宠物月度口粮', 2, 199, '5kg 成猫', '皇家', '厨房/水槽下柜', ['宠物']],
  ['雨伞', '玄关常备', 2, 59, '折叠自动', '天堂伞', '玄关/鞋柜', ['备用']],
  ['口罩', '日常防护', 1, 39, '50 只装', '稳健', '玄关/鞋柜', ['备用']],
];

/** 模板条码：扫这个码可匹配模板并预填新建物品（避免与物品条码重复） */
const TEMPLATE_BARCODES = {
  猫粮: '6905555566666',
  口罩: '6906666677777',
  'A4 打印纸': '6907777788888',
  创可贴: '6908888899999',
};

const NOTIFIERS = [
  ['bark', '手机推送（Bark）', 'item_created', { serverKey: 'demo-key', serverUrl: 'https://api.day.app' }],
  ['telegram', 'Telegram 家庭群', 'item_created,item_updated', { botToken: 'demo-token', chatId: 'demo-chat' }],
  ['dingtalk', '钉钉告警群', 'item_created', { webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=demo', secret: 'demo-secret' }],
  ['smtp', '邮件周报', '', { host: 'smtp.example.com', port: '587', secure: 'true', user: 'bot@example.com', pass: 'demo', from: 'bot@example.com', to: ADMIN.email }],
];

// ---------------------------------------------------------------- 工具
const PALETTE = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0891b2', '#475569'];

function svgTile(text, color) {
  const char = (text || '?').trim().slice(0, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="${text}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="${color}99"/>
    </linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <circle cx="520" cy="90" r="120" fill="#ffffff22"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif"
        font-size="190" font-weight="700" fill="#ffffffdd">${char}</text>
</svg>`;
}

/** 生成本地占位图（自托管，不请求外部图片） */
async function createImage(familyId, userId, label, index) {
  const safe = label.replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 24) || 'img';
  const key = `seed/${index}-${safe}-${shortToken(3)}.svg`;
  const content = svgTile(label, PALETTE[index % PALETTE.length]);
  mkdirSync(resolve(uploadDir, 'seed'), { recursive: true });
  writeFileSync(resolve(uploadDir, key), content);

  const attachments = dataSource.getRepository(Attachment);
  return attachments.save(
    attachments.create({
      familyId,
      key,
      mime: 'image/svg+xml',
      size: Buffer.byteLength(content),
      uploadedById: userId,
    }),
  );
}

async function cleanupUser(email) {
  const userRepo = dataSource.getRepository(User);
  const user = await userRepo.findOne({ where: { email }, select: { id: true } });
  if (!user) return;

  // 只删这个账号**自己拥有**的家庭：家庭下面的位置/物品/标签/通知器等靠外键
  // ON DELETE CASCADE 一并清掉，不会碰到别人当 owner 的家庭
  const familyRepo = dataSource.getRepository(Family);
  const owned = await familyRepo.find({ where: { ownerId: user.id }, select: { id: true } });
  if (owned.length) {
    await familyRepo.delete({ id: In(owned.map((family) => family.id)) });
  }
  await dataSource.getRepository(FamilyMember).delete({ userId: user.id });
  // 先把自己参与的其它家庭的默认归属清掉（User.defaultFamilyId 外键是 SET NULL，删家庭时也会置空）
  await userRepo.update(user.id, { defaultFamilyId: null });
  await userRepo.delete({ id: user.id });
  console.log(`  · 清理旧账号 ${email}`);
}

async function buildTree(familyId, nodes, parentId = null, map = new Map(), path = '') {
  let index = 0;
  const locationRepo = dataSource.getRepository(Location);

  for (const [name, description, children] of nodes) {
    const location = await locationRepo.save(
      locationRepo.create({ familyId, parentId, name, description, sortIndex: index, qrToken: shortToken() }),
    );
    index += 1;
    const fullPath = path ? `${path}/${name}` : name;
    map.set(fullPath, location.id);
    if (children?.length) await buildTree(familyId, children, location.id, map, fullPath);
  }

  return map;
}

// ---------------------------------------------------------------- 主流程
async function main() {
  await dataSource.initialize();

  // 表可能刚被清空：先把迁移跑到最新。
  // 原来的 `prisma migrate deploy` 等价物就是 dataSource.runMigrations()（同样幂等），
  // 从 Prisma 老库迁过来的、表已存在但缺 migrations 记录的情况，先跑 npm run db:baseline
  console.log('确保数据库结构最新…');
  await dataSource.runMigrations();

  const userRepo = dataSource.getRepository(User);
  const familyRepo = dataSource.getRepository(Family);
  const memberRepo = dataSource.getRepository(FamilyMember);
  const inviteRepo = dataSource.getRepository(FamilyInvite);
  const locationRepo = dataSource.getRepository(Location);
  const itemRepo = dataSource.getRepository(Item);
  const unitRepo = dataSource.getRepository(ItemUnit);
  const tagRepo = dataSource.getRepository(Tag);
  const templateRepo = dataSource.getRepository(Template);
  const channelRepo = dataSource.getRepository(NotificationChannel);

  console.log('清理旧数据…');
  for (const email of [ADMIN.email, PARTNER.email, KID.email]) await cleanupUser(email);

  console.log('创建账号…');
  const passwordHash = await hash(ADMIN.password, 10);
  const demo = await userRepo.save(
    userRepo.create({ email: ADMIN.email, username: ADMIN.username, passwordHash, locale: 'zh-CN' }),
  );
  const partner = await userRepo.save(
    userRepo.create({
      email: PARTNER.email,
      username: PARTNER.username,
      passwordHash: await hash(PARTNER.password, 10),
      locale: 'zh-CN',
    }),
  );
  const kid = await userRepo.save(
    userRepo.create({
      email: KID.email,
      username: KID.username,
      passwordHash: await hash(KID.password, 10),
      locale: 'zh-CN',
    }),
  );

  // 个人家庭。原来 Prisma 的 `members: { create: ... }` 是嵌套写，TypeORM 没有对应写法，
  // 改成"先建家庭、再单独插成员行"，最终数据完全一致
  const personal = await familyRepo.save(
    familyRepo.create({
      name: `${ADMIN.username} 的家`,
      isPersonal: true,
      currency: 'CNY',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      ownerId: demo.id,
    }),
  );
  await memberRepo.save(memberRepo.create({ familyId: personal.id, userId: demo.id, role: 'owner' }));
  await userRepo.update(demo.id, { defaultFamilyId: personal.id });

  const shared = await familyRepo.save(
    familyRepo.create({
      name: '样板间',
      isPersonal: false,
      currency: 'CNY',
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      ownerId: demo.id,
    }),
  );
  // 三个成员一次性 create 成数组再 save，等价于原来的 members.create: [...]
  await memberRepo.save(
    memberRepo.create([
      { familyId: shared.id, userId: demo.id, role: 'owner' },
      { familyId: shared.id, userId: partner.id, role: 'admin' },
      { familyId: shared.id, userId: kid.id, role: 'member' },
    ]),
  );
  for (const user of [demo, partner, kid]) {
    await userRepo.update(user.id, { defaultFamilyId: shared.id });
  }

  console.log('创建位置树…');
  const locations = await buildTree(shared.id, TREE);
  const findPath = (name) => {
    if (locations.has(name)) return name;
    for (const path of locations.keys()) {
      if (path.endsWith(`/${name}`)) return path;
    }
    return null;
  };
  const locationId = (name) => locations.get(GROUP_ALIAS[name] ?? findPath(name) ?? name) ?? null;

  console.log('创建标签…');
  const tags = new Map();
  for (const [name, color] of TAGS) {
    // 存 Tag 实体而不是 id：后面多对多要直接挂实体数组（TypeORM 没有 connect 写法）
    const tag = await tagRepo.save(tagRepo.create({ familyId: shared.id, name, color }));
    tags.set(name, tag);
  }

  console.log('创建物品与占位图片…');
  let itemCount = 0;
  let imageIndex = 0;
  let unitCount = 0;
  let missingLocation = 0;

  for (const [group, rows] of Object.entries(CATALOG)) {
    const place = locationId(group);
    if (!place) {
      missingLocation += 1;
      console.error(`  ! 位置未匹配：${group}`);
    }

    for (const [name, quantity, price, model, manufacturer, tagNames, description] of rows) {
      const withImage = itemCount % 4 === 0; // 约 1/4 物品带本地占位图
      const image = withImage ? await createImage(shared.id, demo.id, name, imageIndex++) : null;
      const pack = PACKAGING[name];

      const item = itemRepo.create({
        familyId: shared.id,
        name,
        description,
        quantity,
        baseUnit: pack?.baseUnit ?? null,
        packLevels: pack ? JSON.stringify(pack.packLevels) : null,
        price,
        model,
        manufacturer,
        barcode: BARCODES[name] ?? null,
        locationId: place ?? null,
        coverImageId: image?.id ?? null,
        qrToken: shortToken(),
        // 原来就显式铺开 createdAt（让时间线有分布）。TypeORM 只在**没赋值**时才用
        // @CreateDateColumn 的默认值，显式传入会被原样写入
        createdAt: daysAgo((itemCount * 2) % 180),
      });
      // 标签是多对多：没有嵌套 connect，必须把 Tag 实体数组挂到关系上再 save，
      // TypeORM 会自己写 _ItemTags 连接表
      if (tagNames?.length) {
        item.tags = tagNames.filter((tag) => tags.has(tag)).map((tag) => tags.get(tag));
      }
      const saved = await itemRepo.save(item);

      for (const [sn, unitPath] of UNITS[name] ?? []) {
        await unitRepo.save(
          unitRepo.create({
            familyId: shared.id,
            itemId: saved.id,
            sn,
            locationId: locationId(unitPath) ?? place ?? null,
            note: unitPath,
          }),
        );
        unitCount += 1;
      }

      itemCount += 1;
    }
  }

  console.log('创建模板…');
  for (const [name, description, quantity, price, model, manufacturer, place, tagNames] of TEMPLATES) {
    const pack = PACKAGING[name];
    const template = templateRepo.create({
      familyId: shared.id,
      name,
      description,
      quantity,
      baseUnit: pack?.baseUnit ?? null,
      packLevels: pack ? JSON.stringify(pack.packLevels) : null,
      price,
      model,
      manufacturer,
      barcode: TEMPLATE_BARCODES[name] ?? null,
      defaultLocationId: locationId(place),
    });
    if (tagNames?.length) {
      template.tags = tagNames.filter((t) => tags.has(t)).map((t) => tags.get(t));
    }
    await templateRepo.save(template);
  }

  console.log('创建通知器与邀请链接…');
  for (const [type, name, events, config] of NOTIFIERS) {
    await channelRepo.save(
      channelRepo.create({
        familyId: shared.id,
        type,
        name,
        enabled: false,
        events,
        config: JSON.stringify(config),
      }),
    );
  }
  for (const days of [30, null, 7]) {
    await inviteRepo.save(
      inviteRepo.create({
        familyId: shared.id,
        createdById: demo.id,
        token: shortToken(16),
        expiresAt: days ? daysAgo(-days) : null,
      }),
    );
  }

  console.log('给位置配图…');
  for (const name of ['客厅', '厨房', '储藏室', '书房', '主卧', '车库']) {
    const id = locationId(name);
    if (!id) continue;
    const image = await createImage(shared.id, demo.id, name, imageIndex++);
    await locationRepo.update(id, { imageId: image.id });
  }

  const counts = {
    用户: await userRepo.count(),
    家庭: await familyRepo.count(),
    位置: await locationRepo.count({ where: { familyId: shared.id } }),
    标签: await tagRepo.count({ where: { familyId: shared.id } }),
    物品: itemCount,
    // 原来的 `{ not: null }`，TypeORM 里必须写成 Not(IsNull())，直接写 null 会被 where 校验抛错
    带条码: await itemRepo.count({ where: { familyId: shared.id, barcode: Not(IsNull()) } }),
    带图片: await itemRepo.count({ where: { familyId: shared.id, coverImageId: Not(IsNull()) } }),
    序列号: unitCount,
    模板: await templateRepo.count({ where: { familyId: shared.id } }),
    通知器: await channelRepo.count({ where: { familyId: shared.id } }),
    邀请: await inviteRepo.count({ where: { familyId: shared.id } }),
  };
  if (missingLocation) console.error(`  ! 有 ${missingLocation} 组物品没匹配到位置，已落到无位置`);

  console.log('\n完成 ✓  登录用「用户名 + 密码」（邮箱仅作记录，不再用于登录）：');
  console.log(`  用户名 ${ADMIN.username}   密码 ${ADMIN.password}   （owner，默认家庭「样板间」）`);
  console.log(`  用户名 ${PARTNER.username}   密码 ${PARTNER.password}   （admin 角色）`);
  console.log(`  用户名 ${KID.username}   密码 ${KID.password}   （member 角色）`);
  console.log('数据量：', counts);
}

main()
  .catch((error) => {
    console.error('填充失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // 原来的 prisma.$disconnect() 对应 dataSource.destroy()；initialize 失败时无需销毁
    if (dataSource.isInitialized) await dataSource.destroy();
  });
