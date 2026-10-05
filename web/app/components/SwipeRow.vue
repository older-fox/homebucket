<template>
  <li class="swipe-item">
    <!-- 触点：左滑后从右侧露出 -->
    <div class="swipe-actions">
      <button type="button" tabindex="-1" class="swipe-btn edit" @click="run('edit')">
        <UIcon name="i-lucide-pencil" />
        <span>{{ t('common.edit') }}</span>
      </button>
      <button type="button" tabindex="-1" class="swipe-btn remove" @click="run('delete')">
        <UIcon name="i-lucide-trash-2" />
        <span>{{ t('common.delete') }}</span>
      </button>
    </div>

    <div
      class="swipe-body"
      :style="bodyStyle"
      @touchstart.passive="onStart"
      @touchmove="onMove"
      @touchend="onEnd"
      @touchcancel="onEnd"
      @click.capture="onClickCapture"
    >
      <slot />
    </div>
  </li>
</template>

<script setup lang="ts">
/**
 * 移动端左滑操作行：只接管水平手势（touch-action: pan-y 保证竖向照常滚动页面）。
 * 桌面端不启用（鼠标没有左滑语义），动作按钮保持隐藏。
 */
const props = withDefaults(defineProps<{ actionWidth?: number }>(), { actionWidth: 132 });

const emit = defineEmits<{ edit: []; delete: [] }>();

const { t } = useI18n();

const enabled = ref(false);
onMounted(() => {
  enabled.value = window.matchMedia('(pointer: coarse)').matches;
});

const open = ref(false);
const dragging = ref(false);
const dx = ref(0);

let startX = 0;
let startY = 0;
let axis: 'h' | 'v' | null = null;

const bodyStyle = computed(() => ({
  transform: `translateX(${dragging.value ? dx.value : open.value ? -props.actionWidth : 0}px)`,
  transition: dragging.value ? 'none' : 'transform 0.22s var(--hb-ease)',
}));

function onStart(event: TouchEvent) {
  if (!enabled.value) return;
  const touch = event.touches[0];
  if (!touch) return;
  startX = touch.clientX;
  startY = touch.clientY;
  axis = null;
  dragging.value = false;
  dx.value = open.value ? -props.actionWidth : 0;
}

function onMove(event: TouchEvent) {
  if (!enabled.value) return;
  const touch = event.touches[0];
  if (!touch) return;
  const moveX = touch.clientX - startX;
  const moveY = touch.clientY - startY;

  // 先判方向：竖向就交还给页面滚动，绝不拦截
  if (axis === null) {
    if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return;
    axis = Math.abs(moveX) > Math.abs(moveY) ? 'h' : 'v';
    if (axis === 'v') return;
    dragging.value = true;
  }
  if (axis !== 'h') return;

  event.preventDefault();
  const base = open.value ? -props.actionWidth : 0;
  dx.value = Math.max(-props.actionWidth, Math.min(0, base + moveX));
}

function onEnd() {
  if (!enabled.value) return;
  if (axis === 'h') open.value = dx.value < -props.actionWidth / 2;
  dragging.value = false;
  axis = null;
}

/** 已展开时，点行内任意处只收起，不触发进详情 */
function onClickCapture(event: MouseEvent) {
  if (!open.value) return;
  event.preventDefault();
  event.stopPropagation();
  open.value = false;
}

function run(action: 'edit' | 'delete') {
  open.value = false;
  if (action === 'edit') emit('edit');
  else emit('delete');
}
</script>

<style scoped>
.swipe-item {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--hb-border);
}

.swipe-item:last-child {
  border-bottom: 0;
}

.swipe-actions {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
}

.swipe-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 66px;
  border: 0;
  color: #fff;
  font: inherit;
  font-size: var(--hb-fs-xs);
  cursor: pointer;
}

.swipe-btn.edit {
  background: var(--hb-brand);
}

.swipe-btn.remove {
  background: var(--hb-danger);
}

.swipe-body {
  position: relative;
  background: var(--hb-surface);
  touch-action: pan-y;
  will-change: transform;
}
</style>
