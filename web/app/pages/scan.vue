<template>
  <div>
    <PageHeader :title="t('scan.title')" :description="t('scan.hint')" />

    <div v-if="ready" class="modes">
      <UButton
        v-for="mode in modes"
        :key="mode.value"
        :color="activeMode === mode.value ? 'primary' : 'neutral'"
        :variant="activeMode === mode.value ? 'solid' : 'soft'"
        :icon="mode.icon"
        size="lg"
        class="hb-tap"
        @click="switchMode(mode.value)"
      >
        {{ mode.label }}
      </UButton>
    </div>

    <!-- 挂载后立即定模式：安全上下文直接开摄像头，否则退回手动输入 -->
    <div v-if="!ready" class="panel hb-card">
      <div class="hb-skeleton camera-skeleton" />
    </div>

    <!-- 摄像头（默认入口，进入即开始识别二维码 / 条形码） -->
    <section v-if="ready && activeMode === 'camera'" class="panel hb-card">
      <p v-if="!secure" class="notice">{{ t('scan.insecureContext') }}</p>
      <template v-else>
        <video ref="video" class="video" muted playsinline />
        <div class="row">
          <UButton v-if="!scanning" icon="i-lucide-camera" size="lg" class="hb-tap" @click="startCamera">
            {{ t('scan.start') }}
          </UButton>
          <UButton v-else color="error" variant="soft" icon="i-lucide-square" size="lg" class="hb-tap" @click="stopCamera">
            {{ t('scan.stop') }}
          </UButton>
          <UButton
            v-if="devices.length > 1"
            color="neutral"
            variant="soft"
            icon="i-lucide-switch-camera"
            size="lg"
            class="hb-tap"
            @click="switchCamera"
          >
            {{ t('scan.switchCamera') }}
          </UButton>
        </div>
      </template>
    </section>

    <!-- 图片识别 -->
    <section v-if="ready && activeMode === 'upload'" class="panel hb-card">
      <label class="upload hb-tap">
        <UIcon name="i-lucide-image-plus" />
        <span>{{ t('scan.upload') }}</span>
        <input type="file" accept="image/*" hidden @change="decodeImage" />
      </label>
      <img v-if="preview" :src="preview" class="preview" alt="" />
    </section>

    <!-- 手动输入（兼容扫码枪：聚焦后直接扫） -->
    <section v-if="ready && activeMode === 'manual'" class="panel hb-card">
      <form class="row manual-row" @submit.prevent="lookup(manual)">
        <UInput
          v-model="manual"
          :placeholder="t('scan.manualPlaceholder')"
          size="xl"
          class="grow-input"
          autofocus
          autocomplete="off"
        />
        <UButton type="submit" size="xl" class="hb-tap" :loading="loading">{{ t('scan.lookup') }}</UButton>
      </form>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <!-- 扫码后直接新建物品（商品条码优先的填写流程） -->
    <div v-if="pendingCode" class="pending hb-card hb-rise">
      <div class="pending-head">
        <UIcon name="i-lucide-barcode" />
        <span class="hb-mono hb-break">{{ pendingCode }}</span>
      </div>
      <UButton size="lg" block class="hb-tap" icon="i-lucide-plus" @click="useBarcode">
        {{ t('scan.useBarcodeToCreate') }}
      </UButton>
    </div>

    <!-- 开启后，扫到的条码直接带进「新建物品」表单（放在底部，避免挡住取景框） -->
    <label class="create-mode hb-card hb-tap">
      <USwitch :model-value="createMode" @update:model-value="toggleCreateMode" />
      <span class="create-mode-text">
        <strong>{{ t('scan.useBarcodeToCreate') }}</strong>
        <small class="hb-muted">{{ t('item.barcodeHint') }}</small>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader } from '@zxing/browser';

type Mode = 'camera' | 'upload' | 'manual';

/**
 * 扫码识别器：不带 hints 的 MultiFormatReader 会同时挂上
 * 一维码（EAN/UPC/Code128…）与二维码（QR/DataMatrix/Aztec/PDF417）的 reader，
 * 所以二维码和商品条形码都会被尝试识别。
 * 注意：别再 `import ... from '@zxing/library'` —— 它的 CJS 入口在 Nitro 的
 * ESM 运行时里解析不了（ERR_UNSUPPORTED_DIR_IMPORT），会让 /scan 直接 500。
 */
function createReader() {
  // 每帧之间留一点间隔，降低手机端 CPU 占用
  return new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 });
}

const { t } = useI18n();
const api = useApi();
const toast = useToast();
const route = useRoute();

// 默认摄像头：挂载后若在安全上下文里会自动开启
const activeMode = ref<Mode>('camera');
/** 模式判定完成前先不渲染面板，避免先闪一下手动输入 */
const ready = ref(false);
/** 识别到的码：解析不到对应物品时用它来新建 */
const pendingCode = ref('');
/** ?new=1 时，扫到的条码直接带进新建表单 */
const createMode = ref(route.query.new === '1');
/** ?mode=template 时，扫到的码去模板页搜索/新建模板 */
const templateMode = computed(() => route.query.mode === 'template');
/** 从模板表单点扫码进来时带上，回来直接打开新建模板 */
const fillMode = computed(() => route.query.fill === '1');
/** 底部扫码入口选择的动作：create 新建物品 / find 查找 / edit 编辑（缺省为 find） */
const editMode = computed(() => route.query.mode === 'edit');
const createByMode = computed(() => route.query.mode === 'create');
const secure = ref(false);
const scanning = ref(false);
const loading = ref(false);
const error = ref('');
const manual = ref('');
const preview = ref('');
const devices = ref<MediaDeviceInfo[]>([]);
const deviceIndex = ref(0);

const video = ref<HTMLVideoElement>();
let reader: BrowserMultiFormatReader | null = null;
let controls: { stop: () => void } | null = null;
/** 一次会话只处理第一个识别结果，避免同一码连续触发多次跳转 */
let handled = false;

const modes = computed(() => [
  ...(secure.value ? [{ value: 'camera' as Mode, label: t('scan.camera'), icon: 'i-lucide-camera' }] : []),
  { value: 'upload' as Mode, label: t('scan.upload'), icon: 'i-lucide-image-plus' },
  { value: 'manual' as Mode, label: t('scan.manual'), icon: 'i-lucide-keyboard' },
]);

function toggleCreateMode(value: boolean) {
  createMode.value = value;
  navigateTo({ path: '/scan', query: value ? { new: '1' } : {} }, { replace: true });
}

function useBarcode() {
  const code = pendingCode.value;
  pendingCode.value = '';
  navigateTo({ path: '/items/new', query: { barcode: code } });
}

onMounted(async () => {
  secure.value = window.isSecureContext;
  if (!secure.value) {
    activeMode.value = 'manual';
    ready.value = true;
    return;
  }
  activeMode.value = 'camera';
  ready.value = true;
  await nextTick();
  // 进入扫码即自动开摄像头，不再停在输入页
  await startCamera();
});

onBeforeUnmount(stopCamera);

async function switchMode(mode: Mode) {
  if (activeMode.value === 'camera' && mode !== 'camera') stopCamera();
  activeMode.value = mode;
  // 回到摄像头时自动续扫
  if (mode === 'camera' && !scanning.value) {
    await nextTick();
    await startCamera();
  }
}

function onScanResult(result?: { getText(): string }) {
  if (!result || handled) return;
  handled = true;
  void onDetected(result.getText());
}

async function startCamera() {
  if (!video.value || scanning.value) return;
  error.value = '';
  handled = false;
  reader = reader ?? createReader();

  try {
    const deviceId = devices.value[deviceIndex.value]?.deviceId;
    controls = deviceId
      ? await reader.decodeFromVideoDevice(deviceId, video.value, onScanResult)
      : // 没指定设备时优先后置摄像头（手机扫码习惯）
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video.value,
          onScanResult,
        );
    scanning.value = true;
    // 授权后才能拿到设备名，用于「切换摄像头」
    void refreshDevices();
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      error.value = t('scan.cameraNotFound');
      activeMode.value = 'manual';
      return;
    }
    // 权限被拒 / 被浏览器策略拦下：留在摄像头页，给出说明和「开始扫描」按钮供重试
    error.value = err.name === 'NotAllowedError' || err.name === 'SecurityError'
      ? t('scan.cameraDenied')
      : `${t('scan.cameraFailed')}：${err.message ?? ''}`;
  }
}

function stopCamera() {
  controls?.stop();
  controls = null;
  scanning.value = false;
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const all = await navigator.mediaDevices.enumerateDevices();
  devices.value = all.filter((item) => item.kind === 'videoinput');
}

async function switchCamera() {
  if (devices.value.length < 2) return;
  deviceIndex.value = (deviceIndex.value + 1) % devices.value.length;
  stopCamera();
  await startCamera();
}

async function decodeImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  error.value = '';
  pendingCode.value = '';

  if (!file.type.startsWith('image/')) {
    error.value = t('scan.imageUnreadable');
    return;
  }

  preview.value = URL.createObjectURL(file);
  try {
    const decodeReader = createReader();
    const result = await decodeReader.decodeFromImageUrl(preview.value);
    handled = false;
    await onDetected(result.getText());
  } catch (e) {
    // ZXing 在"图里没有码 / 码不完整 / 校验失败"时都会抛错，这里统一给出明确说明
    const name = (e as { name?: string })?.name ?? '';
    error.value = ['NotFoundException', 'ChecksumException', 'FormatException'].includes(name)
      ? t('scan.imageNoCode')
      : t('scan.imageUnreadable');
    toast.add({ title: error.value, color: 'error' });
  }
}

async function onDetected(code: string) {
  stopCamera();
  if (templateMode.value) {
    navigateTo({
      path: '/templates',
      query: fillMode.value ? { q: code.trim(), fill: '1' } : { q: code.trim() },
    });
    return;
  }
  if (createMode.value || createByMode.value) {
    navigateTo({ path: '/items/new', query: { barcode: code.trim() } });
    return;
  }
  await lookup(code);
}

async function lookup(code: string) {
  const value = code.trim();
  if (!value) return;

  if (templateMode.value) {
    navigateTo({
      path: '/templates',
      query: fillMode.value ? { q: value, fill: '1' } : { q: value },
    });
    return;
  }

  if (createMode.value || createByMode.value) {
    navigateTo({ path: '/items/new', query: { barcode: value } });
    return;
  }

  loading.value = true;
  error.value = '';
  pendingCode.value = '';

  try {
    const result = await api.get<{
      type: string;
      id: number;
      itemId?: number;
      matchedBy?: 'barcode' | 'qrcode' | 'sn';
    }>(`/scan/${encodeURIComponent(value)}`);

    if (result.matchedBy === 'barcode') {
      toast.add({ title: t('scan.matchedByBarcode'), color: 'success' });
    }

    if (result.type === 'location') {
      await navigateTo(`/locations?focus=${result.id}`);
      return;
    }

    const itemId = result.type === 'unit' ? result.itemId : result.id;
    // edit：打开物品详情并定位到编辑区
    await navigateTo(editMode.value ? `/items/${itemId}?edit=1` : `/items/${itemId}`);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    error.value = err.status === 404 ? t('scan.notFound') : (err.message ?? t('scan.notFound'));
    // 没命中时给出「用这个条码新建物品」的入口
    pendingCode.value = err.status === 404 ? value : '';
    toast.add({ title: error.value, color: 'error' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.modes {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.panel {
  padding: 16px;
}

.camera-skeleton {
  height: 220px;
}

.video {
  width: 100%;
  max-height: 60vh;
  border-radius: 10px;
  background: #000;
}

.row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.manual-row {
  margin-top: 0;
}

.grow-input {
  flex: 1;
  min-width: 0;
}

.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  border: 1px dashed var(--hb-border-strong);
  border-radius: 12px;
  color: var(--hb-muted);
  cursor: pointer;
}

.preview {
  margin-top: 12px;
  width: 100%;
  max-height: 240px;
  object-fit: contain;
}

.notice {
  margin: 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-warning);
}

.create-mode {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-top: 14px;
  cursor: pointer;
}

.create-mode-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

.create-mode-text strong {
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
}

.create-mode-text small {
  font-size: var(--hb-fs-xs);
}

.pending {
  margin-top: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pending-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--hb-brand);
}

.pending-head :deep(svg) {
  width: 18px;
  height: 18px;
}

.pending-head span {
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-semibold);
}

.error {
  margin-top: 12px;
  color: var(--hb-danger);
  font-size: var(--hb-fs-sm);
}
</style>
