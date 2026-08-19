import type { ResolvedDateRange } from "./search-intent.types.js";
import type { SearchIntent } from "./search-intent.schema.js";

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

export function resolveDateFilter(
  filter: SearchIntent["date"],
  now = new Date(),
): ResolvedDateRange | undefined {
  if (!filter) return undefined;
  const today = startOfDay(now);
  switch (filter.kind) {
    case "custom":
      return { from: filter.from, to: endOfDay(filter.to) };
    case "this_week": {
      const from = new Date(today);
      from.setUTCDate(today.getUTCDate() - today.getUTCDay());
      const to = new Date(from);
      to.setUTCDate(from.getUTCDate() + 6);
      return { from, to: endOfDay(to) };
    }
    case "this_month": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      return { from, to: endOfDay(to) };
    }
    case "next_month": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
      return { from, to: endOfDay(to) };
    }
    case "next_7_days":
      return { from: today, to: endOfDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7))) };
    case "next_30_days":
      return { from: today, to: endOfDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30))) };
    case "next_90_days":
      return { from: today, to: endOfDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 90))) };
    case "upcoming":
      return { from: today };
    case "ongoing":
      return { from: undefined, to: endOfDay(today) };
    default:
      return { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)) };
  }
}
