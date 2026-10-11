<script setup lang="ts">
import type { OverdueEntry } from '~/composables/useNotifications';

const { t } = useI18n();
const toast = useToast();
const api = useApi();
const { relative } = useFormat();
const { count, entries, overdue, loading, refresh } = useNotifications();

const open = ref(false);
/** 正在提交的那一条（同一个面板里可能有多条，只禁用被点的那一条） */
const busy = ref('');

function rowKey(entry: OverdueEntry) {
  return `${entry.kind}-${entry.itemId}-${entry.unitId ?? 'item'}`;
}

/**
 * 就地标记遗失：提醒面板里的条目不必先跳进详情页。
 *
 * 单元条目只标记那一个序列号，整件条目才标记整件物品；两者都是幂等且可逆的，
 * 所以不弹确认框（与物品详情页的 toggleLost 保持一致）。成功后重拉提醒，
 * 该条目随即从列表和角标里消失。
 */
async function markLost(entry: OverdueEntry) {
  const key = rowKey(entry);
  busy.value = key;
  try {
    if (entry.kind === 'unit' && entry.unitId) {
      await api.post(`/items/${entry.itemId}/units/${entry.unitId}/lost`, {});
    } else {
      await api.post(`/items/${entry.itemId}/lost`, {});
    }
    await refresh();
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    busy.value = '';
  }
}

/**
 * 打开就重问一次：后端按需计算，本地缓存只在两次打开之间有效。
 * 另外切换家庭必须立刻清掉旧数据，否则角标会挂着上一个家庭的数字。
 */
function onOpen() {
  void refresh();
}

watch(api.familyId, () => {
  void refresh();
});

onMounted(() => {
  void refresh();
});

function goSettings() {
  open.value = false;
  // 用查询参数指定初始 tab：设置页拿 ?tab=account 直接把「取走过久提醒」摆在眼前
  void navigateTo('/settings?tab=account');
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', sideOffset: 8 }" :ui="{ content: 'w-[21rem] p-0' }">
    <button
      type="button"
      class="bell-btn hb-tap"
      :aria-label="t('notifications.title')"
      :aria-expanded="open"
      @click="onOpen"
    >
      <UIcon name="i-lucide-bell" :class="{ spinning: loading }" />
      <span v-if="count" class="bell-badge">{{ count > 99 ? '99+' : count }}</span>
    </button>

    <template #content>
      <div class="panel">
        <div class="panel-head">
          <div>
            <strong>{{ t('notifications.title') }}</strong>
            <span class="hb-muted">{{ t('notifications.overdue') }}</span>
          </div>
          <button type="button" class="link hb-tap" :aria-label="t('notifications.refresh')" @click="refresh">
            <UIcon name="i-lucide-refresh-cw" :class="{ spinning: loading }" />
          </button>
        </div>

        <!-- 关掉了提醒：不显示条目，直接给一条去设置的出口 -->
        <div v-if="overdue && !overdue.enabled" class="panel-empty">
          <UIcon name="i-lucide-bell-off" />
          <p>{{ t('notifications.disabled') }}</p>
          <small class="hb-muted">{{ t('notifications.disabledHint') }}</small>
          <UButton size="sm" variant="soft" class="hb-tap" @click="goSettings">
            {{ t('notifications.goSettings') }}
          </UButton>
        </div>

        <div v-else-if="!entries.length" class="panel-empty">
          <UIcon name="i-lucide-circle-check" />
          <p>{{ t('notifications.empty') }}</p>
        </div>

        <ul v-else class="panel-list">
          <li v-for="entry in entries" :key="rowKey(entry)" class="entry-row">
            <NuxtLink
              :to="`/items/${entry.itemId}`"
              class="entry hb-tap"
              @click="open = false"
            >
              <span class="entry-days">{{ t('notifications.days', { days: entry.days }) }}</span>
              <span class="entry-main">
                <span class="entry-title">{{ entry.itemName }}</span>
                <span class="entry-sub hb-muted">
                  {{ entry.kind === 'unit' ? t('notifications.unit', { sn: entry.sn || t('notifications.noSn') }) : t('notifications.wholeItem') }}
                  <template v-if="entry.location"> · {{ entry.location.name }}</template>
                </span>
                <span class="entry-sub hb-muted">{{ t('notifications.takenOutAt', { time: relative(entry.takenOutAt) }) }}</span>
              </span>
            </NuxtLink>
            <button
              type="button"
              class="entry-action hb-tap"
              :disabled="busy === rowKey(entry)"
              :aria-label="`${t('item.markLost')} — ${entry.itemName}`"
              :title="t('item.markLost')"
              @click="markLost(entry)"
            >
              <UIcon name="i-lucide-search-x" />
            </button>
          </li>
        </ul>

        <p v-if="overdue?.enabled" class="panel-foot hb-muted">
          {{ t('notifications.threshold', { days: overdue.thresholdDays }) }}
        </p>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
/*
 * 这里的尺寸照着 layouts/default.vue 的 .icon-btn 抄了一份：
 * 那个类的作用域只覆盖布局自身模板里的元素，管不到本组件内部的按钮。
 */
.bell-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: transparent;
  color: var(--hb-text-2);
  cursor: pointer;
  transition: background var(--hb-dur) var(--hb-ease);
}

.bell-btn:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.bell-btn :deep(svg) {
  width: 19px;
  height: 19px;
}

.bell-badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: var(--hb-r-full);
  background: var(--hb-danger);
  color: #fff;
  font-size: 10px;
  font-weight: var(--hb-fw-semibold);
  line-height: 17px;
  text-align: center;
}

.panel {
  display: flex;
  flex-direction: column;
  max-height: min(70vh, 30rem);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hb-border);
}

.panel-head strong {
  font-size: var(--hb-fs-body);
}

.panel-head div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.panel-head .hb-muted {
  font-size: var(--hb-fs-xs);
}

.link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: transparent;
  color: var(--hb-text-2);
  cursor: pointer;
}

.link:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 26px 16px;
  text-align: center;
}

.panel-empty :deep(svg) {
  width: 22px;
  height: 22px;
  color: var(--hb-muted);
}

.panel-empty p {
  margin: 0;
  font-size: var(--hb-fs-sm);
}

.panel-empty small {
  font-size: var(--hb-fs-xs);
}

.panel-list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  border-bottom: 1px solid var(--hb-border);
}

.entry {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  text-decoration: none;
  color: inherit;
}

.entry:hover {
  background: var(--hb-surface-2);
}

.entry-action {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: transparent;
  color: var(--hb-text-2);
  cursor: pointer;
}

.entry-action:hover {
  background: var(--hb-surface-2);
  color: var(--hb-warning);
}

.entry-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.entry-action :deep(svg) {
  width: 16px;
  height: 16px;
}

.entry-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.entry-title {
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-medium);
}

.entry-sub {
  font-size: var(--hb-fs-xs);
}

.entry-days {
  flex: 0 0 auto;
  height: fit-content;
  padding: 1px 7px;
  border-radius: var(--hb-r-full);
  background: var(--hb-surface-2);
  color: var(--hb-danger);
  font-size: var(--hb-fs-xs);
  font-weight: var(--hb-fw-semibold);
  white-space: nowrap;
}

.panel-foot {
  margin: 0;
  padding: 9px 14px;
  border-top: 1px solid var(--hb-border);
  font-size: var(--hb-fs-xs);
}

.spinning {
  animation: hb-spin 1s linear infinite;
}

@keyframes hb-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
