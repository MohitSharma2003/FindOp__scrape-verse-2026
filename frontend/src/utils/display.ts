export function formatDate(value?: string) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not available";
}

export function formatShortDate(value?: string) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";
}

export function getSourceLabel(value?: string) {
  const raw = value?.trim();

  if (!raw || /^unknown$/i.test(raw)) {
    return "Source unavailable";
  }

  try {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    const parts = hostname.split(".").filter(Boolean);
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];

    return name
      ? name
          .split(/[-_]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
      : "Source unavailable";
  } catch {
    return raw;
  }
}
