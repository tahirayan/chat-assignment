import type { Locale } from "@chat/shared-types";
import { createI18n } from "vue-i18n";
import en from "../locales/en.json";

const SUPPORTED: readonly Locale[] = ["en", "tr", "et"] as const;
const STORAGE_KEY = "locale";

function isLocale(value: string): value is Locale {
  return (SUPPORTED as readonly string[]).includes(value);
}

export function detectInitial(): Locale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) {
      return stored;
    }
    const browser = window.navigator.language.split("-")[0];
    if (browser && isLocale(browser)) {
      return browser;
    }
  }
  return "en";
}

const datetimeShape = {
  short: { day: "numeric", month: "short" },
  long: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
} as const;

// Non-EN locale JSON is split into its own chunk. Only the *active* locale
// ships on first paint; switching to another loads its chunk on demand.
// EN stays bundled because it's also the fallback when keys are missing.
const NON_EN_LOADERS: Record<
  Exclude<Locale, "en">,
  () => Promise<{ default: typeof en }>
> = {
  tr: () => import("../locales/tr.json"),
  et: () => import("../locales/et.json"),
};

const loadedLocales = new Set<Locale>(["en"]);

export const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en },
  datetimeFormats: {
    en: datetimeShape,
    tr: datetimeShape,
    et: datetimeShape,
  },
});

async function ensureLoaded(locale: Locale): Promise<void> {
  if (loadedLocales.has(locale)) {
    return;
  }
  if (locale === "en") {
    // Already in the initial bundle — defensive.
    loadedLocales.add(locale);
    return;
  }
  const loader = NON_EN_LOADERS[locale];
  const mod = await loader();
  i18n.global.setLocaleMessage(locale, mod.default);
  loadedLocales.add(locale);
}

export async function setLocale(next: Locale): Promise<void> {
  await ensureLoaded(next);
  i18n.global.locale.value = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
}
