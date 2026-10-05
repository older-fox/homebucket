<template>
  <div>
    <PageHeader :title="t('scan.title')" :description="t('scan.hint')" />

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
  </div>
</template>

<script setup lang="ts">
import { BrowserMultiFormatReader } from '@zxing/browser';

type Mode = 'camera' | 'upload' | 'manual';

const { t } = useI18n();
const api = useApi();
const toast = useToast();

const activeMode = ref<Mode>('manual');
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
  preview.value = URL.createObjectURL(file);
  try {
    const decodeReader = new BrowserMultiFormatReader();
    const result = await decodeReader.decodeFromImageUrl(preview.value);
    await onDetected(result.getText());
  } catch {
    error.value = t('scan.notFound');
  }
}

async function onDetected(code: string) {
  stopCamera();
  await lookup(code);
}

async function lookup(code: string) {
  const value = code.trim();
  if (!value) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.get<{ type: string; id: number; itemId?: number }>(`/scan/${encodeURIComponent(value)}`);
    if (result.type === 'location') await navigateTo(`/locations?focus=${result.id}`);
    else await navigateTo(`/items/${result.type === 'unit' ? result.itemId : result.id}`);
  } catch (e) {
    error.value = (e as { message?: string }).message ?? t('scan.notFound');
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

.error {
  margin-top: 12px;
  color: var(--hb-danger);
  font-size: var(--hb-fs-sm);
}
</style>
