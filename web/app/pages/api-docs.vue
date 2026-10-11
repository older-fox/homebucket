<script setup lang="ts">
import { marked } from 'marked';
import apiZh from '~/assets/docs/api.zh-CN.md?raw';
import apiEn from '~/assets/docs/api.en.md?raw';

/**
 * 只读 API 说明页。
 *
 * 文档是随前端一起打包的静态 markdown（`app/assets/docs/api.*.md`），不是用户输入，
 * 所以这里用 v-html 渲染是安全的；换成用户可编辑的内容时必须先消毒。
 *
 * 路由是 `/api-docs` 而不是 `/api`：`/api/**` 由 nitro 代理给 Nest，占用不得。
 */
definePageMeta({ layoutMode: 'scroll', layoutModeMobile: 'scroll' });

const { t, locale } = useI18n();

useHead({ title: () => t('nav.apiDocs') });

const source = computed(() => (locale.value.toLowerCase().startsWith('zh') ? apiZh : apiEn));
const html = computed(() => String(marked.parse(source.value)));
</script>

<template>
  <div class="api-docs">
    <PageHeader :title="t('nav.apiDocs')" />
    <article class="doc hb-card" v-html="html" />
  </div>
</template>

<style scoped>
.doc {
  padding: 18px 20px;
  line-height: 1.7;
}

/* v-html 渲染出来的元素没有 scoped 属性，选择器必须走 :deep() */
.doc :deep(h1) {
  margin: 0 0 10px;
  font-size: var(--hb-fs-h2);
}

.doc :deep(h2) {
  margin: 26px 0 10px;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
}

.doc :deep(h3) {
  margin: 20px 0 8px;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
}

.doc :deep(p),
.doc :deep(li) {
  font-size: var(--hb-fs-sm);
}

.doc :deep(p) {
  margin: 0 0 10px;
}

.doc :deep(ul),
.doc :deep(ol) {
  margin: 0 0 12px;
  padding-left: 20px;
}

.doc :deep(a) {
  color: var(--hb-brand);
}

.doc :deep(code) {
  padding: 1px 5px;
  border-radius: 6px;
  background: var(--hb-surface-2);
  font-family: var(--hb-font-mono);
  font-size: var(--hb-fs-xs);
}

.doc :deep(pre) {
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-sm);
  background: var(--hb-surface-2);
  overflow-x: auto;
}

.doc :deep(pre code) {
  padding: 0;
  background: none;
  font-size: var(--hb-fs-xs);
  line-height: 1.6;
}

.doc :deep(table) {
  width: 100%;
  margin: 0 0 14px;
  border-collapse: collapse;
  font-size: var(--hb-fs-xs);
}

.doc :deep(th),
.doc :deep(td) {
  padding: 7px 9px;
  border: 1px solid var(--hb-border);
  text-align: left;
  vertical-align: top;
}

.doc :deep(th) {
  background: var(--hb-surface-2);
  font-weight: var(--hb-fw-medium);
}

.doc :deep(blockquote) {
  margin: 0 0 12px;
  padding-left: 12px;
  border-left: 3px solid var(--hb-border);
  color: var(--hb-muted);
}

.doc :deep(hr) {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid var(--hb-border);
}
</style>
