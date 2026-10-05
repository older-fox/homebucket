<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" role="img" aria-label="Homebucket">
    <defs>
      <linearGradient id="hb-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2bb3a3" />
        <stop offset="1" stop-color="#1b7f74" />
      </linearGradient>
    </defs>
    <path d="M32 6 L58 26 L6 26 Z" fill="#f4a259" />
    <path d="M12 26 H52 L47 58 H17 Z" fill="url(#hb-body)" />
    <rect x="14.6" y="34" width="34.8" height="4" rx="2" fill="#ffffff" opacity=".85" />
    <rect x="15.8" y="44" width="32.4" height="4" rx="2" fill="#ffffff" opacity=".55" />
    <rect x="27" y="18" width="10" height="13" rx="2" fill="#0f3d38" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 32 });
</script>
