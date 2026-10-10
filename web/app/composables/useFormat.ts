/** 货币/日期格式化：跟随当前语言 + 家庭设置的 currency，全部走 Intl */
export function useFormat() {
  const { locale } = useI18n();
  const { current } = useFamily();
  const currency = computed(() => current.value?.currency ?? 'CNY');

  const money = (value: number | string | null | undefined) =>
    new Intl.NumberFormat(locale.value, { style: 'currency', currency: currency.value }).format(
      Number(value ?? 0),
    );

  const number = (value: number | string | null | undefined) =>
    new Intl.NumberFormat(locale.value).format(Number(value ?? 0));

  const date = (value: string | Date | null | undefined) =>
    value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value)) : '';

  const dateTime = (value: string | Date | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(value),
        )
      : '';

  /**
   * 相对时间（"3 天前"/"5 分钟前"）：用于"已取走多久"这类状态描述。
   * 取最大的非零单位即可——状态看的是量级，不需要"1 个月 3 天前"这种精度。
   */
  const relative = (value: string | Date | null | undefined) => {
    if (!value) return '';
    const diffMs = new Date(value).getTime() - Date.now();
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
    const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 365 * 24 * 60 * 60 * 1000],
      ['month', 30 * 24 * 60 * 60 * 1000],
      ['day', 24 * 60 * 60 * 1000],
      ['hour', 60 * 60 * 1000],
      ['minute', 60 * 1000],
      ['second', 1000],
    ];
    for (const [unit, ms] of steps) {
      // 最后一档兜底，保证任何非空时间都有输出
      if (unit === 'second' || Math.abs(diffMs) >= ms) {
        return formatter.format(Math.round(diffMs / ms), unit);
      }
    }
    return '';
  };

  return { money, number, date, dateTime, relative, currency };
}
