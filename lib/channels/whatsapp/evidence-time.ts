type EvidenceTimeOptions = {
  locale?: string;
  timeZone?: string;
};

export function formatEvidenceTimeRange(values: string[], options: EvidenceTimeOptions = {}) {
  const dates = values
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  if (!dates.length) return "";

  const locale = options.locale ?? "es-AR";
  const timeZone = options.timeZone ?? "America/Argentina/Cordoba";
  const first = dates[0];
  const last = dates.at(-1)!;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", hourCycle: "h23", timeZone });
  const dateTime = (value: Date) => `${date.format(value)}, ${time.format(value)}`;

  if (first.getTime() === last.getTime()) return dateTime(first);

  if (date.format(first) === date.format(last)) {
    return `${date.format(first)}, ${time.format(first)}–${time.format(last)}`;
  }

  return `${dateTime(first)} – ${dateTime(last)}`;
}
