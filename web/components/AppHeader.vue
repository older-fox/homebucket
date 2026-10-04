<template>
  <header class="hb-header">
    <NuxtLink to="/" class="brand">
      <img src="/logo.svg" alt="Homebucket" width="36" height="36" />
      <span>Homebucket</span>
    </NuxtLink>
    <p class="slogan">归档收纳，记住每样东西的位置</p>
  </header>
</template>

<style scoped>
.hb-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid #e6ebe9;
  background: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #15655c;
  text-decoration: none;
}

.slogan {
  margin: 0;
  color: #6b7a76;
  font-size: 13px;
}
</style>
