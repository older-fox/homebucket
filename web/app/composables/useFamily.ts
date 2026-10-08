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
    // 家庭上下文变了：所有按家庭维度缓存的数据（dashboard / items / templates …）
    // 都必须作废，否则新家庭页面上会继续显示上一个家庭的内容
    clearNuxtData();
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
