export function normalizeDateInputValue(value: unknown, invalidMessage: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/\-\s.](\d{1,2})[\/\-\s.](\d{4})$/);
  if (!match) throw new Error(invalidMessage);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(invalidMessage);
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateOnlyObject(value: unknown): Date | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoDateOnly(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addMonthsToDateOnly(value: unknown, months: number): string {
  const start = dateOnlyObject(value);
  if (!start) return "";
  const result = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== originalDay) result.setDate(0);
  return isoDateOnly(result);
}

export function formatDateForInput(value: unknown): string {
  const date = dateOnlyObject(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}
