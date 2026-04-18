export async function readJsonBody<T>(request: Request): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = (await request.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Body JSON tidak valid" };
  }
}

export function toPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

export function toNonNegativeInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
}

export function toPositiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

export function parseSqliteDateTime(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  // SQLite DATETIME default: "YYYY-MM-DD HH:MM:SS" (UTC tanpa suffix timezone)
  // Ubah menjadi ISO UTC agar tidak salah offset timezone saat diparse JS.
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;

  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}
