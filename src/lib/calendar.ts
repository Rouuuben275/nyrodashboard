export function dateValue(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseLocalDate(value: string): Date | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return undefined;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12);
  return dateValue(date) === value ? date : undefined;
}
export function timeOptions(step = 5, min = "00:00", max = "23:59") {
  const interval = Math.max(1, Math.min(60, Math.floor(step)));
  return Array.from({ length: Math.ceil(1440 / interval) }, (_, i) => {
    const minute = i * interval;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  }).filter(t => t >= min && t <= max);
}
