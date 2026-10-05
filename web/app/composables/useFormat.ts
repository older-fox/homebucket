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

  return { money, number, date, dateTime, currency };
}
