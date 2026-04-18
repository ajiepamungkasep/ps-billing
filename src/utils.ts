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
