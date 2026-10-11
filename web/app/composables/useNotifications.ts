export interface OverdueEntry {
  kind: 'item' | 'unit';
  itemId: number;
  itemName: string;
  unitId: number | null;
  sn: string | null;
  location: { id: number; name: string } | null;
  takenOutAt: string;
  days: number;
}

export interface OverdueResult {
  enabled: boolean;
  thresholdDays: number;
  generatedAt: string;
  count: number;
  entries: OverdueEntry[];
}

/**
 * 取走过久提醒。
 *
 * 后端是「按需计算」：没有定时任务，也没有已读状态表 —— 每次问都是拿当前时间和阈值现算。
 * 所以前端这层也只是一个薄壳：结果放 useState 让顶栏铃铛与面板共享，
 * 由调用方决定什么时候再问一次（打开面板、切换家庭、标记遗失/放回之后）。
 */
export function useNotifications() {
  const api = useApi();

  const overdue = useState<OverdueResult | null>('hb-notifications', () => null);
  const loading = useState<boolean>('hb-notifications-loading', () => false);

  /** 角标只数「关闭提醒」之外的条目：阈值设成 0 时后端会回 enabled:false，那时不该有角标 */
  const count = computed(() => (overdue.value?.enabled ? overdue.value.count : 0));
  const entries = computed(() => (overdue.value?.enabled ? overdue.value.entries : []));

  async function refresh() {
    loading.value = true;
    try {
      overdue.value = await api.get<OverdueResult>('/notifications/overdue');
    } catch {
      // 提醒是锦上添花：拿不到就当作没有，不弹错误也不留旧角标
      overdue.value = null;
    } finally {
      loading.value = false;
    }
  }

  return { overdue, count, entries, loading, refresh };
}
