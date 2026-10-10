/**
 * 扫码浮窗（ScanActionSheet）的状态与动作。
 *
 * 状态用 useState 而不是组件内的 ref：浮窗本身全局只挂一份（在布局里），
 * 但"刚扫到了什么、它是不是被取走了"这类信息任何页面都可能要用，
 * 而且码枪监听和界面按钮走的是同一条查询链路，集中在这里才不会两处各写一遍。
 */

/** 与后端 ScanService 的 ScanCard 同形：浮窗中间那张卡片要展示的数据 */
export interface ScanCard {
  name: string;
  subtitle: string | null;
  quantity: number | null;
  /** 包装：最小单位名 + 层级（为空表示未启用），用于展示"X 箱 Y 瓶" */
  baseUnit: string | null;
  packLevels: { name: string; factor: number }[];
  price: number | null;
  locationName: string | null;
  imageUrl: string | null;
  traceCode: string | null;
  barcode: string | null;
  sn: string | null;
  unitCount: number | null;
}

/** 与后端 ScanService 的 ScanTarget 同形：一个码解析出来的结果 */
export interface ScanTarget {
  type: 'item' | 'unit' | 'template' | 'location';
  id: number;
  itemId?: number;
  name: string;
  barcode?: string | null;
  traceCode?: string | null;
  sn?: string | null;
  matchedBy: 'barcode' | 'traceCode' | 'qrcode' | 'sn';
  /** null = 在库，有时间 = 已取走（记的是取走时刻，界面要显示"多久之前"） */
  takenOutAt: string | null;
  card: ScanCard;
}

/** loading：正在查；found：查到了；notfound：码不在本家庭；error：网络/服务异常 */
export type ScanSheetStatus = 'loading' | 'found' | 'notfound' | 'error';

export function useScanSheet() {
  const api = useApi();
  const toast = useToast();
  const { t } = useI18n();

  const open = useState('hb-scan-open', () => false);
  const status = useState<ScanSheetStatus>('hb-scan-status', () => 'loading');
  const code = useState('hb-scan-code', () => '');
  const target = useState<ScanTarget | null>('hb-scan-target', () => null);
  const message = useState('hb-scan-message', () => '');
  const busy = useState('hb-scan-busy', () => false);

  /** 只有物品和序列号件能被取走/放回；位置和模板命中后只是跳转 */
  const takeable = computed(() => target.value?.type === 'item' || target.value?.type === 'unit');
  const takenOut = computed(() => Boolean(target.value?.takenOutAt));
  /** 序列号件要跳到它所属的物品 */
  const itemId = computed(() => {
    if (!target.value) return null;
    return target.value.itemId ?? (target.value.type === 'item' ? target.value.id : null);
  });

  /** 查码并打开浮窗；404 单独归类，因为它对应"要不要用它新建"这条分支 */
  async function lookup(rawCode: string) {
    const value = rawCode.trim();
    if (!value) return;

    code.value = value;
    target.value = null;
    message.value = '';
    status.value = 'loading';
    open.value = true;

    try {
      target.value = await api.get<ScanTarget>(`/scan/${encodeURIComponent(value)}`);
      status.value = 'found';
    } catch (error) {
      const err = error as { status?: number; message?: string };
      if (err.status === 404) {
        status.value = 'notfound';
      } else {
        status.value = 'error';
        message.value = err.message ?? '';
      }
    }
  }

  /**
   * 取走 / 放回：接口会把动作后的新状态一起返回，直接替换即可，不必再查一次。
   * 返回是否成功——成功时调用方（浮窗）会收起，失败则保持打开让用户重试。
   */
  async function setTakenOut(next: boolean): Promise<boolean> {
    if (!code.value || !takeable.value || busy.value) return false;

    busy.value = true;
    try {
      target.value = await api.post<ScanTarget>(
        `/scan/${encodeURIComponent(code.value)}/${next ? 'take' : 'return'}`,
      );
      toast.add({ title: t(next ? 'scan.takeOutDone' : 'scan.putBackDone'), color: 'success' });
      return true;
    } catch (error) {
      toast.add({
        title: (error as { message?: string }).message || t('errors.unknown'),
        color: 'error',
      });
      return false;
    } finally {
      busy.value = false;
    }
  }

  function takeOut() {
    return setTakenOut(true);
  }

  function putBack() {
    return setTakenOut(false);
  }

  function close() {
    open.value = false;
  }

  return {
    open,
    status,
    code,
    target,
    message,
    busy,
    takeable,
    takenOut,
    itemId,
    lookup,
    takeOut,
    putBack,
    close,
  };
}
