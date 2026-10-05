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
  const currentId = useCookie<string | null>('hb_family', { default: () => null, path: '/' });

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
    currentId.value = String(id);
    await navigateTo('/');
  }

  async function refresh() {
    return load(true);
  }

  return { families, current, currentId, load, switchTo, refresh };
}
