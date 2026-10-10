export interface FamilySummary {
  id: number;
  name: string;
  currency: string;
  locale: string;
  timeZone: string;
  isPersonal: boolean;
  isOwner: boolean;
  role: string;
  memberCount: number;
  itemCount: number;
  locationCount: number;
}

/** 家庭列表 + 当前家庭（存在 cookie 的 hb_family 里，useApi 会自动带上 X-Family-Id） */
export function useFamily() {
  const api = useApi();
  // 这里能用 useRouter() 但**不能**用 useRoute()：useFamily 会被 auth.global.ts 里的
  // 全局中间件调用（先确定登录态与家庭列表），而 Nuxt 4 明确禁止在中间件里 useRoute()，
  // 每次导航都会报 NUXT_E2005（中间件里拿到的路由还不是即将进入的那条）。
  // useRouter() 没有这个限制，真正需要路径的只有 switchTo()，那时再读 currentRoute 即可。
  const router = useRouter();
  const locations = useLocations();
  const families = useState<FamilySummary[]>('hb_families', () => []);
  /**
   * 当前家庭 id 直接用 useApi 里那一份共享状态，而不是再 useCookie('hb_family') 一次。
   *
   * useCookie 每次调用都会新建一个独立的 ref，所以「自己再拿一个 currentId」会导致：
   * switchTo() / load() 只改了这个副本，而真正决定 X-Family-Id 请求头的那份没变 ——
   * 切换家庭后请求仍然带着旧家庭 id，页面上就会出现别的家庭的数据。
   * 这里复用同一份状态后，写 currentId 会同时更新请求头与 cookie。
   */
  const currentId = api.familyId;

  const current = computed(
    () => families.value.find((family) => String(family.id) === String(currentId.value)) ?? null,
  );

  async function load(force = false) {
    if (families.value.length && !force) return families.value;
    families.value = await api.get<FamilySummary[]>('/families');
    const exists = families.value.some((family) => String(family.id) === String(currentId.value));
    if (!exists) {
      currentId.value = families.value.length ? String(families.value[0]?.id) : null;
    }
    return families.value;
  }

  async function switchTo(id: number) {
    if (String(id) === String(currentId.value)) return;
    currentId.value = String(id);

    // 家庭上下文变了：所有按家庭维度缓存的数据都必须作废，
    // 否则新家庭页面上会继续显示上一个家庭的内容。
    clearNuxtData();
    // 位置树与各位置内容同样只属于一个家庭
    locations.reset();

    if (router.currentRoute.value.path === '/') {
      // 已经在首页时，navigateTo('/') 属于「重复导航」，vue-router 会直接忽略它：
      // 页面不会重新执行 setup，被清掉的 dashboard 缓存也就没人去重新拉 ——
      // 表现就是切了家庭还要手动刷新整页。这里显式重新取一次数。
      await refreshNuxtData();
      return;
    }

    // 其它页面则跳回首页；首页因为缓存已清空，会自己重新取数
    await navigateTo('/');
  }

  async function refresh() {
    return load(true);
  }

  /**
   * 退出登录 / 切换账号时清空。
   * families 与 currentId 都只属于上一个账号：如果不清理，登录新账号后 load()
   * 会因为「列表非空」直接返回旧账号的家庭，并把 hb_family 设成旧账号的家庭 id，
   * 于是首页显示别的账号的家庭、请求也带着错误的 X-Family-Id。
   */
  function reset() {
    families.value = [];
    currentId.value = null;
  }

  return { families, current, currentId, load, switchTo, refresh, reset };
}
