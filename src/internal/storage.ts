export function readVersionedLocalStorageValue<T>({
  currentKey,
  fallback,
  legacyKeys = [],
  parse
}: {
  currentKey: string;
  fallback: T;
  legacyKeys?: string[];
  parse: (raw: string) => T | null;
}): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  for (const key of [currentKey, ...legacyKeys]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      const parsed = parse(raw);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Ignore storage failures so the widget can still render in restricted contexts.
    }
  }

  return fallback;
}

export function writeLocalStorageValue(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so persistence remains best-effort.
  }
}

export function removeLocalStorageValues(keys: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures so cleanup remains best-effort.
    }
  }
}
