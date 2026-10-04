<template>
  <div>
    <AppHeader />
    <main class="page">
      <NuxtPage />
    </main>
  </div>
</template>

<style>
:root {
  --hb-primary: #1b7f74;
  --hb-accent: #f4a259;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  color: #1f2b28;
  background: #f7faf9;
}

.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px;
}
</style>
