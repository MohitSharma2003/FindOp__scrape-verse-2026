import { searchIntentSchema, type SearchIntent } from "./search-intent.schema.js";

export class SearchIntentValidationError extends Error {
  public constructor(public readonly issues: unknown) {
    super("Invalid search intent");
  }
}

function clean(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(clean).filter((item) => item !== "");
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  }
  return value;
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeSearchIntent(input: unknown): unknown {
  const value = clean(input) as Record<string, unknown>;
  if (!value || typeof value !== "object") return value;
  if (typeof value.type === "string") value.type = value.type.toLowerCase();
  if (typeof value.mode === "string") value.mode = value.mode.toLowerCase();
  if (Array.isArray(value.keywords)) value.keywords = uniqueText(value.keywords as string[]);
  if (Array.isArray(value.skills)) value.skills = uniqueText(value.skills as string[]);
  const location = value.location as Record<string, unknown> | undefined;
  if (location) {
    for (const key of ["country", "city", "region"]) {
      if (typeof location[key] === "string") location[key] = location[key].replace(/\s+/g, " ");
    }
  }
  return value;
}

export function parseSearchIntent(input: unknown): SearchIntent {
  const result = searchIntentSchema.safeParse(normalizeSearchIntent(input));
  if (!result.success) throw new SearchIntentValidationError(result.error.flatten());
  return result.data;
}
