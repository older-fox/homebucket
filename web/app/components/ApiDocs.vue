<script setup lang="ts">
import { marked } from 'marked';
import apiZh from '~/assets/docs/api.zh-CN.md?raw';
import apiEn from '~/assets/docs/api.en.md?raw';

/**
 * API 说明（只读与可写物品两种权限）。
 *
 * 文档是随前端一起打包的静态 markdown（`app/assets/docs/api.*.md`），不是用户输入，
 * 所以这里用 v-html 渲染是安全的；换成用户可编辑的内容时必须先消毒。
 *
 * 唯一的消费方是设置页的 API keys tab（`/settings?tab=apiKeys`）：它原先还是侧栏里的
 * 独立页面 `/api-docs`，收进设置页后不再单独占一个导航项。嵌进去时用 hideTitle 去掉
 * markdown 自己的 h1，标题交给外面的小节标题，免得页里出现两个同级标题。
 */
const props = defineProps<{ hideTitle?: boolean }>();

const { locale } = useI18n();

const source = computed(() => (locale.value.toLowerCase().startsWith('zh') ? apiZh : apiEn));
const html = computed(() => {
  const md = props.hideTitle ? source.value.replace(/^#\s+[^\n]*\r?\n+/, '') : source.value;
  return String(marked.parse(md));
});
</script>

<template>
  <article class="doc hb-card" v-html="html" />
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

.doc :deep(h2:first-child) {
  margin-top: 0;
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
  /* 写接口那张表里全是长路径，min-content 宽度会撑破手机版：改成自己能横向滚动，
     否则浏览器会把整个 layout viewport 撑宽、整页缩小（390px 下会变成 601px 宽） */
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
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
