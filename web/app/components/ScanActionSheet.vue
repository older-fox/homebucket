<template>
  <UModal v-model:open="open" :title="t('scan.sheetTitle')">
    <template #body>
      <div class="sheet">
        <!-- 正在查 -->
        <div v-if="status === 'loading'" class="center">
          <UIcon name="i-lucide-loader-circle" class="spin" />
          <p class="muted">{{ t('scan.looking') }}</p>
          <p class="code-line">{{ code }}</p>
        </div>

        <!-- 查到了：物品 / 序列号件 / 模板 / 位置 -->
        <template v-else-if="status === 'found' && target">
          <div class="head">
            <div class="thumb">
              <img v-if="target.card.imageUrl" :src="target.card.imageUrl" :alt="target.card.name" />
              <UIcon v-else :name="typeIcon" />
            </div>
            <div class="head-text">
              <h2 class="name hb-truncate">{{ target.card.name }}</h2>
              <p v-if="target.card.subtitle" class="subtitle hb-truncate">{{ target.card.subtitle }}</p>
              <div class="tags">
                <span class="hb-chip tiny">{{ typeLabel }}</span>
                <span class="hb-chip tiny">{{ codeLabel }}</span>
              </div>
            </div>
          </div>

          <!-- 取走状态只对物品/序列号件有意义 -->
          <div v-if="takeable" class="status" :class="{ out: takenOut }">
            <span class="dot" />
            <span>{{ statusText }}</span>
          </div>

          <dl v-if="metaRows.length" class="meta">
            <div v-for="row in metaRows" :key="row.label" class="meta-row">
              <dt><UIcon :name="row.icon" />{{ row.label }}</dt>
              <dd :class="{ muted: row.muted, mono: row.mono }">{{ row.value }}</dd>
            </div>
          </dl>

          <!-- 主操作：查到的码决定它是"取走"还是"放回" -->
          <UButton
            v-if="takeable"
            block
            size="lg"
            :color="takenOut ? 'success' : 'primary'"
            :icon="takenOut ? 'i-lucide-undo-2' : 'i-lucide-hand'"
            :loading="busy"
            @click="onPrimary"
          >
            {{ takenOut ? t('scan.putBack') : t('scan.takeOut') }}
          </UButton>
          <UButton
            v-else-if="target.type === 'location'"
            block
            size="lg"
            icon="i-lucide-map-pinned"
            @click="goLocation"
          >
            {{ t('scan.viewLocation') }}
          </UButton>
          <UButton v-else block size="lg" icon="i-lucide-file-plus" @click="goTemplate">
            {{ t('scan.useTemplate') }}
          </UButton>

          <!-- 其他功能项 -->
          <div class="actions">
            <button v-if="itemId" type="button" class="action" @click="goDetail">
              <UIcon name="i-lucide-square-arrow-out-up-right" />
              <span>{{ t('scan.detail') }}</span>
            </button>
            <button v-if="itemId" type="button" class="action" @click="goEdit">
              <UIcon name="i-lucide-pencil" />
              <span>{{ t('scan.edit') }}</span>
            </button>
            <button v-if="target.type === 'location'" type="button" class="action" @click="goLocation">
              <UIcon name="i-lucide-folder" />
              <span>{{ t('scan.viewContents') }}</span>
            </button>
            <button type="button" class="action" @click="copyCode">
              <UIcon name="i-lucide-copy" />
              <span>{{ t('scan.copyCode') }}</span>
            </button>
          </div>
        </template>

        <!-- 没找到：直接用它新建 -->
        <div v-else-if="status === 'notfound'" class="center">
          <UIcon name="i-lucide-circle-question-mark" class="big-icon" />
          <h2>{{ t('scan.notFoundTitle') }}</h2>
          <p class="muted">{{ t('scan.notFoundHint', { code }) }}</p>
          <UButton block size="lg" icon="i-lucide-plus" @click="goCreate">
            {{ t('scan.createWithCode') }}
          </UButton>
          <UButton block size="lg" variant="ghost" @click="close">{{ t('common.close') }}</UButton>
        </div>

        <!-- 出错 -->
        <div v-else class="center">
          <UIcon name="i-lucide-triangle-alert" class="big-icon warn" />
          <h2>{{ t('scan.errorTitle') }}</h2>
          <p class="muted">{{ message || t('scan.errorHint') }}</p>
          <UButton block size="lg" icon="i-lucide-refresh-cw" @click="retry">
            {{ t('common.retry') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * 扫码浮窗：码枪扫到一个码之后，按"这个码当前是什么状态"给出下一步动作。
 *
 * 码枪监听放在这里，是因为浮窗是唯一一个"由扫码决定要不要出现"的界面，
 * 监听和它的副作用（字符缓冲、兜底定时器）放在同一个组件里才不会分家。
 * 浮窗挂在布局层所以全站生效——首页是主要场景，其他页面顺手也能用，
 * 而下面的守卫（焦点在输入框里就不接管）足以避免抢走正常输入。
 */
const { t } = useI18n();
const { money, relative } = useFormat();
const { format: formatUnits } = useUnits();
const toast = useToast();
const {
  open,
  status,
  code,
  target,
  message,
  busy,
  takeable,
  takenOut,
  itemId,
  lookup,
  takeOut,
  putBack,
  close,
} = useScanSheet();

/* ---------------- 码枪识别 ---------------- */

/** 少于这个长度不当条码：手滑误触很难凑够 4 个字符 */
const SCAN_MIN_LENGTH = 4;
/** 相邻两字符超过这个间隔就认为不是同一串码枪输入（人手打字通常在 50ms 以上） */
const SCAN_MAX_GAP_MS = 60;
/** 有的码枪不补回车：停手这么久就把缓冲当成一整串码 */
const SCAN_IDLE_MS = 250;

let buffer = '';
let lastAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function isTypingTarget(node: EventTarget | null) {
  const el = node as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

function flush() {
  const value = buffer;
  buffer = '';
  if (value.length >= SCAN_MIN_LENGTH) void lookup(value);
}

function onKeydown(event: KeyboardEvent) {
  // 焦点在输入框里、或按了 Ctrl/Alt/Cmd：都是人在正常操作，放弃这一串。
  // Shift 不算——条码里的大写字母和符号本来就带 Shift。
  if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
    buffer = '';
    return;
  }

  if (event.key === 'Enter') {
    if (buffer.length >= SCAN_MIN_LENGTH) {
      // 拦掉回车：否则会顺带触发当前焦点元素（比如某个按钮）的默认行为
      event.preventDefault();
      if (idleTimer) clearTimeout(idleTimer);
      flush();
    }
    return;
  }

  // 只认单字符键；Shift/Tab/方向键这些一律忽略
  if (event.key.length !== 1) return;

  const now = Date.now();
  if (now - lastAt > SCAN_MAX_GAP_MS) buffer = '';
  buffer += event.key;
  lastAt = now;

  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(flush, SCAN_IDLE_MS);
}

onMounted(() => window.addEventListener('keydown', onKeydown, true));

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  if (idleTimer) clearTimeout(idleTimer);
});

/* ---------------- 展示用的派生数据 ---------------- */

const typeLabel = computed(() => {
  switch (target.value?.type) {
    case 'location':
      return t('scan.typeLocation');
    case 'template':
      return t('scan.typeTemplate');
    case 'unit':
      return t('scan.typeUnit');
    default:
      return t('scan.typeItem');
  }
});

const typeIcon = computed(() => {
  switch (target.value?.type) {
    case 'location':
      return 'i-lucide-map-pinned';
    case 'template':
      return 'i-lucide-file-plus';
    case 'unit':
      return 'i-lucide-barcode';
    default:
      return 'i-lucide-package';
  }
});

/** 同一个物品既有商品条码又有追溯码，得说清楚这次是按哪个码命中的 */
const codeLabel = computed(() => {
  switch (target.value?.matchedBy) {
    case 'traceCode':
      return t('scan.matchedByTraceCode');
    case 'qrcode':
      return t('scan.matchedByQrcode');
    case 'sn':
      return t('scan.matchedBySn');
    default:
      return t('scan.matchedByBarcode');
  }
});

const statusText = computed(() =>
  takenOut.value
    ? t('scan.takenOutAgo', { time: relative(target.value?.takenOutAt) })
    : t('scan.inStock'),
);

const metaRows = computed(() => {
  const current = target.value;
  const rows: Array<{ icon: string; label: string; value: string; muted?: boolean; mono?: boolean }> = [];
  if (!current) return rows;

  // 位置命中的就是它自己，再写一行"位置：客厅"是废话
  if (current.type === 'item' || current.type === 'unit') {
    rows.push({
      icon: 'i-lucide-map-pinned',
      label: t('scan.locationLabel'),
      value: current.card.locationName ?? t('scan.noLocation'),
      muted: !current.card.locationName,
    });
  }
  if (current.card.quantity !== null) {
    rows.push({
      icon: 'i-lucide-layers',
      label: t('scan.quantityLabel'),
      value: formatUnits(current.card.quantity, current.card.baseUnit, current.card.packLevels),
    });
  }
  if (current.card.unitCount) {
    rows.push({
      icon: 'i-lucide-barcode',
      label: t('scan.unitsLabel'),
      value: t('scan.unitCountLabel', { count: current.card.unitCount }),
    });
  }
  if (current.card.price !== null) {
    rows.push({
      icon: 'i-lucide-banknote',
      label: t('scan.priceLabel'),
      value: money(current.card.price),
    });
  }
  if (current.card.sn) {
    rows.push({
      icon: 'i-lucide-hash',
      label: t('scan.snLabel'),
      value: current.card.sn,
      mono: true,
    });
  }
  if (current.card.traceCode) {
    rows.push({
      icon: 'i-lucide-qr-code',
      label: t('scan.traceCodeLabel'),
      value: current.card.traceCode,
      mono: true,
    });
  }
  return rows;
});

/* ---------------- 动作 ---------------- */

/**
 * 所有动作都遵循"操作完就收起浮窗"：
 *   · 浮窗挂在布局层、open 存在 useState 里，跳转后并不会自动卸载，
 *     不显式 close() 的话它会一直盖在新页面上；
 *   · 取走/放回是原地动作，成功后同样收起（失败则保持打开，方便重试）。
 */
async function onPrimary() {
  const ok = await (takenOut.value ? putBack() : takeOut());
  if (ok) close();
}

const goDetail = () => {
  close();
  if (itemId.value) return navigateTo(`/items/${itemId.value}`);
};
const goEdit = () => {
  close();
  if (itemId.value) return navigateTo(`/items/${itemId.value}?edit=1`);
};
const goLocation = () => {
  close();
  if (target.value) return navigateTo(`/locations?focus=${target.value.id}`);
};
const goCreate = () => {
  close();
  return navigateTo({ path: '/items/new', query: { barcode: code.value } });
};
const goTemplate = () => {
  close();
  if (target.value) return navigateTo({ path: '/items/new', query: { templateId: target.value.id } });
};
const retry = () => lookup(code.value);

async function copyCode() {
  try {
    await navigator.clipboard.writeText(code.value);
    toast.add({ title: t('common.copied'), color: 'success' });
  } catch {
    // 没有剪贴板权限时把内容显示出来，至少能手动抄
    toast.add({ title: code.value, color: 'info' });
  }
}
</script>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--hb-gap);
}

/* 卡片头：缩略图 + 名称/副标题/标签 */
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.thumb {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--hb-r-lg);
  background: var(--hb-brand-soft);
  color: var(--hb-brand-strong);
  font-size: 28px;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.head-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  margin: 0;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
  color: var(--hb-text);
}

.subtitle {
  margin: 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 状态条：在库 / 已取走 */
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--hb-r-md);
  background: var(--hb-brand-soft);
  color: var(--hb-brand-strong);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-medium);
}

.status.out {
  background: var(--hb-surface-2);
  color: var(--hb-text-2);
}

.status .dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: var(--hb-r-full);
  background: currentColor;
}

.status.out .dot {
  background: var(--hb-warning);
}

/* 明细行：标签在左、值在右 */
.meta {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hb-border);
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row dt {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.meta-row dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  font-size: var(--hb-fs-sm);
  color: var(--hb-text);
  overflow-wrap: anywhere;
}

.meta-row dd.muted {
  color: var(--hb-muted);
}

.meta-row dd.mono {
  font-family: var(--hb-font-mono);
}

/* 其他功能项 */
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  background: var(--hb-surface);
  color: var(--hb-text-2);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-medium);
  cursor: pointer;
  transition: background var(--hb-dur) var(--hb-ease), border-color var(--hb-dur) var(--hb-ease);
}

.action:hover {
  background: var(--hb-surface-2);
  border-color: var(--hb-border-strong);
  color: var(--hb-text);
}

/* 功能项是奇数个时，最后一个占满整行，不留下半格空白 */
.action:last-child:nth-child(odd) {
  grid-column: span 2;
}

/* 触屏上把可点区域垫到 44px 高 */
@media (pointer: coarse) {
  .action {
    min-height: 44px;
  }
}

/* 空状态 / 异常：图标 + 标题 + 说明 + 按钮 */
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0 4px;
  text-align: center;
}

.center h2 {
  margin: 0;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
  color: var(--hb-text);
}

.center .muted {
  margin: 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.big-icon {
  font-size: 44px;
  color: var(--hb-muted);
}

.big-icon.warn {
  color: var(--hb-warning);
}

.spin {
  font-size: 32px;
  color: var(--hb-brand);
  animation: hb-scan-spin 1s linear infinite;
}

@keyframes hb-scan-spin {
  to {
    transform: rotate(360deg);
  }
}

.code-line {
  margin: 0;
  font-family: var(--hb-font-mono);
  font-size: var(--hb-fs-sm);
  color: var(--hb-text-2);
  overflow-wrap: anywhere;
}
</style>
