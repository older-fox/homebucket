/** 响应式断点判断（SSR 时返回 false，挂载后再同步真实值） */
export function useBreakpoint(query = '(max-width: 767px)') {
  const matches = ref(false);

  onMounted(() => {
    const media = window.matchMedia(query);
    const update = () => {
      matches.value = media.matches;
    };
    update();
    media.addEventListener('change', update);
    onBeforeUnmount(() => media.removeEventListener('change', update));
  });

  return matches;
}
