<template>
  <div class="hb-fill">
    <!-- 独立的移动端位置详情页：竖屏排版，不再被左右分栏挤压 -->
    <div class="hb-pane detail-shell">
      <LocationDetail
        ref="detail"
        :id="id"
        mobile
        back
        @edit="dialogs?.openEdit(id)"
        @create-child="dialogs?.openCreate(id)"
        @qr="dialogs?.openQr(id)"
        @select="openChild"
      />
    </div>

    <LocationDialogs ref="dialogs" @saved="refresh" @deleted="onDeleted" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layoutMode: 'fixed', layoutModeMobile: 'scroll' });

const route = useRoute();

const id = Number(route.params.id);
const detail = ref<{ refresh: () => Promise<void> } | null>(null);
const dialogs = ref<{ openCreate: (id: number | null) => void; openEdit: (id: number) => void; openQr: (id: number) => void } | null>(
  null,
);

/** 子位置：继续钻取（push 进去，返回键/返回箭头都能逐级退回） */
function openChild(childId: number) {
  navigateTo(`/locations/${childId}`);
}

async function refresh() {
  await detail.value?.refresh();
}

async function onDeleted() {
  // 当前位置被删除：回到位置树
  await navigateTo('/locations');
}

// 号码非法时兜底回列表
if (!Number.isInteger(id) || id <= 0) {
  await navigateTo('/locations');
}
</script>

<style scoped>
/* 移动端整页滚动：去掉面板外框，让内容跟随页面 */
@media (max-width: 767px) {
  .detail-shell {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
}
</style>
