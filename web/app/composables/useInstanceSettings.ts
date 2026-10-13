import type { ApiError } from './useApi';

export type InstanceSettingType = 'string' | 'secret' | 'bool' | 'int' | 'size' | 'enum' | 'cron' | 'url';
export type InstanceSettingSource = 'db' | 'env' | 'default';

/** 一项实例配置（形状与 server/src/settings/settings.service.ts 的 SettingItemView 对应） */
export interface InstanceSetting {
  envName: string;
  group: string;
  type: InstanceSettingType;
  source: InstanceSettingSource;
  hasOverride: boolean;
  restartRequired: boolean;
  pendingRestart: boolean;
  warning?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  allowEmpty?: boolean;
  /** 当前生效值；密钥类**没有**这个字段（服务端从不回传密钥明文） */
  value?: string;
  defaultValue?: string;
  /** 仅密钥类：是否已有显式配置（数据库或 .env） */
  isSet?: boolean;
}

interface InstanceSettingsView {
  groups: string[];
  items: InstanceSetting[];
}

type DraftValue = string | boolean;

/**
 * 实例设置（「设置 → 实例设置」）。
 *
 * 界面上的编辑不直接改 `items`，而是改一份 `draft`：
 * 保存前要能回答"哪些项动过"（只提交动过的，免得把没碰的项也写成覆盖值），
 * 还要能把「重置为内置默认」表达成一次显式的 `null`。
 */
export function useInstanceSettings() {
  const api = useApi();
  const { t } = useI18n();
  const toast = useToast();

  const items = ref<InstanceSetting[]>([]);
  const groups = ref<string[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const search = ref('');

  const draft = reactive<Record<string, DraftValue>>({});
  const initial = reactive<Record<string, DraftValue>>({});
  /** 标记"这项要恢复成 .env / 内置默认"，保存时发 null */
  const resetting = reactive<Record<string, boolean>>({});

  function messageOf(error: unknown): string {
    return (error as ApiError | undefined)?.message ?? t('errors.unknown');
  }

  /** 表单里的初值：布尔用布尔（配合 USwitch），其余一律字符串 */
  function draftOf(item: InstanceSetting): DraftValue {
    if (item.type === 'bool') return item.value === 'true';
    // 密钥类没有 value（服务端不回传），草稿从空开始：留空 = 不改
    return item.value ?? '';
  }

  /** 用服务端返回的视图重建草稿（首次加载与每次保存后都走这里） */
  function seed(view: InstanceSettingsView) {
    items.value = view.items;
    groups.value = view.groups;
    for (const key of Object.keys(draft)) {
      delete draft[key];
      delete initial[key];
      delete resetting[key];
    }
    for (const item of view.items) {
      const value = draftOf(item);
      draft[item.envName] = value;
      initial[item.envName] = value;
    }
  }

  async function load() {
    loading.value = true;
    try {
      seed(await api.get<InstanceSettingsView>('/admin/settings'));
    } catch (error) {
      toast.add({ title: messageOf(error), color: 'error' });
    } finally {
      loading.value = false;
    }
  }

  function isDirty(envName: string): boolean {
    return Boolean(resetting[envName]) || draft[envName] !== initial[envName];
  }

  /**
   * 写草稿。控件发的值类型不统一（USwitch 给 boolean，USelect/UInput 给字符串或数字），
   * 统一在这里归一化，模板里就不用写类型断言了。
   */
  function setDraft(envName: string, value: unknown) {
    draft[envName] = typeof value === 'boolean' ? value : String(value ?? '');
  }

  const dirtyKeys = computed(() => items.value.filter((item) => isDirty(item.envName)).map((item) => item.envName));

  /** 恢复成 .env / 内置默认：只改草稿与标记，真正生效在保存时（发 null） */
  function resetField(item: InstanceSetting) {
    resetting[item.envName] = true;
    draft[item.envName] =
      item.type === 'bool' ? (item.defaultValue ?? 'true') === 'true' : (item.defaultValue ?? '');
  }

  function itemsOf(group: string): InstanceSetting[] {
    const needle = search.value.trim().toLowerCase();
    return items.value.filter((item) => {
      if (item.group !== group) return false;
      if (!needle) return true;
      // 按环境变量名与译名匹配：两种都试，用户可能记得任一种
      const label = t(`settings.fields.${item.envName}.label`).toLowerCase();
      return item.envName.toLowerCase().includes(needle) || label.includes(needle);
    });
  }

  const hasVisibleItems = computed(() => groups.value.some((group) => itemsOf(group).length > 0));

  async function save() {
    const values: Record<string, unknown> = {};
    for (const key of dirtyKeys.value) values[key] = resetting[key] ? null : draft[key];
    if (Object.keys(values).length === 0) return;

    saving.value = true;
    try {
      seed(await api.patch<InstanceSettingsView>('/admin/settings', { values }));
      toast.add({ title: t('common.saved'), color: 'success' });
    } catch (error) {
      toast.add({ title: messageOf(error), color: 'error' });
    } finally {
      saving.value = false;
    }
  }

  const sourceKey: Record<InstanceSettingSource, string> = {
    db: 'settings.sourceDb',
    env: 'settings.sourceEnv',
    default: 'settings.sourceDefault',
  };

  return {
    items,
    groups,
    loading,
    saving,
    search,
    draft,
    dirtyKeys,
    hasVisibleItems,
    itemsOf,
    isDirty,
    setDraft,
    resetField,
    load,
    save,
    sourceKey,
  };
}
