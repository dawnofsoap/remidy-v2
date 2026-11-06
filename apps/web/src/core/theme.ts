export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'remidy.theme';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Storage can be unavailable, for example in private browsing, so failures fall back to system. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(preference: ThemePreference): void {
  if (preference === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  applyTheme(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The theme still applies for this visit.
  }
}
