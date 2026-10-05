<template>
  <div>
    <PageHeader :title="t('scan.title')" :description="t('scan.hint')" />

    <!-- 开启后，扫到的条码直接带进「新建物品」表单 -->
    <label class="create-mode hb-card hb-tap">
      <USwitch :model-value="createMode" @update:model-value="toggleCreateMode" />
      <span class="create-mode-text">
        <strong>{{ t('scan.useBarcodeToCreate') }}</strong>
        <small class="hb-muted">{{ t('item.barcodeHint') }}</small>
      </span>
    </label>

    <div class="modes">
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

    <!-- 摄像头 -->
    <section v-if="activeMode === 'camera'" class="panel hb-card">
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
    <section v-if="activeMode === 'upload'" class="panel hb-card">
      <label class="upload hb-tap">
        <UIcon name="i-lucide-image-plus" />
        <span>{{ t('scan.upload') }}</span>
        <input type="file" accept="image/*" hidden @change="decodeImage" />
      </label>
      <img v-if="preview" :src="preview" class="preview" alt="" />
    </section>

    <!-- 手动输入（兼容扫码枪：聚焦后直接扫） -->
    <section v-if="activeMode === 'manual'" class="panel hb-card">
      <form class="row" @submit.prevent="lookup(manual)">
        <UInput
          ref="manualInput"
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
  </div>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader } from '@zxing/browser';

type Mode = 'camera' | 'upload' | 'manual';

const { t } = useI18n();
const api = useApi();
const toast = useToast();
const route = useRoute();

const activeMode = ref<Mode>('manual');
/** 识别到的码：解析不到对应物品时用它来新建 */
const pendingCode = ref('');
/** ?new=1 时，扫到的条码直接带进新建表单 */
const createMode = ref(route.query.new === '1');
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
  if (secure.value && navigator.mediaDevices?.enumerateDevices) {
    devices.value = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === 'videoinput');
  }
});

onBeforeUnmount(stopCamera);

function switchMode(mode: Mode) {
  if (activeMode.value === 'camera') stopCamera();
  activeMode.value = mode;
}

async function startCamera() {
  if (!video.value) return;
  error.value = '';
  reader = reader ?? new BrowserMultiFormatReader();
  try {
    const deviceId = devices.value[deviceIndex.value]?.deviceId;
    controls = await reader.decodeFromVideoDevice(deviceId, video.value, (result) => {
      if (result) void onDetected(result.getText());
    });
    scanning.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function stopCamera() {
  controls?.stop();
  controls = null;
  scanning.value = false;
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
    const decodeReader = new BrowserMultiFormatReader();
    const result = await decodeReader.decodeFromImageUrl(preview.value);
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
  if (createMode.value) {
    navigateTo({ path: '/items/new', query: { barcode: code.trim() } });
    return;
  }
  await lookup(code);
}

async function lookup(code: string) {
  const value = code.trim();
  if (!value) return;

  if (createMode.value) {
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

    if (result.type === 'location') await navigateTo(`/locations?focus=${result.id}`);
    else await navigateTo(`/items/${result.type === 'unit' ? result.itemId : result.id}`);
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
}

.grow-input {
  flex: 1;
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
  margin-bottom: 14px;
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
