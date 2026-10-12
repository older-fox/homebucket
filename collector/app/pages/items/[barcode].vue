<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ContributionList from '../../components/ContributionList.vue';
import FieldSourceTable from '../../components/FieldSourceTable.vue';
import Pager from '../../components/Pager.vue';
import { capture, useApi } from '../../composables/useApi';
import type { ContributionListPage, ItemDetail, Loaded } from '../../composables/useApi';

const api = useApi();
const route = useRoute();
const { t } = useI18n();

const barcode = computed(() => String(route.params.barcode ?? ''));
const trendPage = ref(1);
const trendPageSize = 10;

const { data: detailData, pending } = await useAsyncData<Loaded<ItemDetail>>(
  () => `item-${barcode.value}`,
  () => capture(() => api.item(barcode.value)),
  {
    watch: [barcode],
    default: (): Loaded<ItemDetail> => ({ data: null, error: '', status: 0 }),
  },
);

const { data: trendData } = await useAsyncData<Loaded<ContributionListPage>>(
  () => `item-trend-${barcode.value}-${trendPage.value}`,
  () => capture(() => api.itemContributions(barcode.value, trendPage.value, trendPageSize)),
  {
    watch: [barcode, trendPage],
    default: (): Loaded<ContributionListPage> => ({ data: null, error: '', status: 0 }),
  },
);

watch(barcode, () => {
  trendPage.value = 1;
});

const detail = computed(() => detailData.value?.data ?? null);
const notFound = computed(() => detailData.value?.status === 404);
const error = computed(() => (notFound.value ? '' : detailData.value?.error ?? ''));
const loading = computed(() => pending.value);
const contributions = computed(() => trendData.value?.data?.contributions ?? []);
const trendTotal = computed(() => trendData.value?.data?.total ?? 0);

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

/** 厂商 / 型号 / 分类三段拼一行；全空时退回一句提示（i18n 里已备好整句）。 */
const summary = computed(() => {
  const parts = detail.value ? [detail.value.manufacturer, detail.value.model, detail.value.category].filter(Boolean) : [];
  return parts.length > 0 ? parts.join(t('common.listSep')) : t('item.noAttributes');
});

useHead({ title: computed(() => t('item.title')) });

const dt = 'text-gray-500 dark:text-gray-400';
const dd = 'm-0 break-words text-gray-900 dark:text-white';
</script>

<template>
  <div class="flex flex-wrap items-center gap-2.5">
    <UButton to="/" variant="outline" color="neutral" size="sm">{{ t('item.backToSearch') }}</UButton>
  </div>

  <AppNotice v-if="error" tone="error" class="mt-4" data-testid="notice">{{ error }}</AppNotice>
  <p v-else-if="loading" class="mt-4 text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</p>
  <AppNotice v-else-if="notFound" tone="neutral" class="mt-4" data-testid="notice">
    {{ t('item.notFound') }}
  </AppNotice>

  <template v-if="detail">
    <!-- h1 里只能放物品名：验收脚本读它确认导航到了正确的条目，混进条码/徽标就会读失败 -->
    <div data-testid="page-head" class="mt-5 flex flex-wrap items-center gap-2.5">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ detail.name || t('item.noName') }}</h1>
      <UBadge v-if="detail.barcode" variant="soft" color="neutral" size="sm" class="font-mono tabular">
        {{ detail.barcode }}
      </UBadge>
      <!-- 锁定态只靠颜色会漏掉读屏用户：徽标带文字，外加一个读得出来的 aria -->
      <UBadge
        v-for="field in detail.lockedFields"
        :key="field"
        variant="soft"
        color="neutral"
        size="sm"
        :aria-label="t('item.ariaLockedField', { field })"
      >
        {{ t('item.fieldLocked', { field }) }}
      </UBadge>
    </div>
    <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
      {{ t('item.meta', {
        summary,
        instances: detail.instanceCount,
        contributions: detail.contributionCount,
        firstSeenAt: shortTime(detail.firstSeenAt),
        updatedAt: shortTime(detail.updatedAt),
      }) }}
    </p>

    <div class="grid gap-4 sm:grid-cols-2">
      <AppCard :title="t('item.info')">
        <dl class="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt :class="dt">{{ t('item.identityKey') }}</dt>
          <dd :class="[dd, 'font-mono text-xs break-all']">{{ detail.identityKey }}</dd>
          <dt :class="dt">{{ t('item.field.description') }}</dt>
          <dd :class="dd">{{ detail.description || t('common.empty') }}</dd>
          <dt :class="dt">{{ t('item.baseUnit') }}</dt>
          <dd :class="dd">{{ detail.baseUnit || t('common.empty') }}</dd>
          <dt :class="dt">{{ t('item.attributes') }}</dt>
          <dd :class="dd">
            <template v-if="Object.keys(detail.attributes).length > 0">
              <UBadge
                v-for="(value, key) in detail.attributes"
                :key="key"
                variant="soft"
                color="neutral"
                size="sm"
                class="mr-1 mb-1"
              >
                {{ key }}: {{ value }}
              </UBadge>
            </template>
            <span v-else class="text-gray-500 dark:text-gray-400">{{ t('common.empty') }}</span>
          </dd>
        </dl>
      </AppCard>

      <AppCard :title="t('item.images', { count: detail.imageUrls.length })">
        <div v-if="detail.imageUrls.length > 0" class="flex flex-wrap gap-2">
          <img
            v-for="url in detail.imageUrls"
            :key="url"
            :src="url"
            :alt="t('item.imageAlt')"
            class="h-24 w-24 rounded-lg border border-gray-200 object-cover dark:border-gray-800"
          />
        </div>
        <p v-else class="m-0 text-sm text-gray-500 dark:text-gray-400">{{ t('item.noImages') }}</p>
      </AppCard>
    </div>

    <AppCard class="mt-4" :title="t('item.fieldSources')" :subtitle="t('item.mergeRule')">
      <FieldSourceTable :fields="detail.fields" />
    </AppCard>

    <AppCard class="mt-4" :title="t('item.contributions', { count: trendTotal })">
      <ContributionList :contributions="contributions" />
      <Pager :page="trendPage" :page-size="trendPageSize" :total="trendTotal" @update:page="(value) => (trendPage = value)" />
    </AppCard>
  </template>
</template>
