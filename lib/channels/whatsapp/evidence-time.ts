export function formatEvidenceTimeRange(values: string[]) {
  const dates = values
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  if (!dates.length) return "";

  const locale = "es-AR";
  const timeZone = "Asia/Shanghai";
  const first = dates[0];
  const last = dates.at(-1)!;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", hourCycle: "h23", timeZone });
  const dateTime = (value: Date) => `${date.format(value)}, ${time.format(value)}`;

  let value: string;

  if (first.getTime() === last.getTime()) {
    value = dateTime(first);
  } else if (date.format(first) === date.format(last)) {
    value = `${date.format(first)}, ${time.format(first)}–${time.format(last)}`;
  } else {
    value = `${dateTime(first)} – ${dateTime(last)}`;
  }

  return `${value} · hora de China`;
}
