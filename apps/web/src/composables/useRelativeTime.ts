import type { Locale } from "@chat/shared-types";
import { type ComputedRef, computed } from "vue";
import { useI18n } from "vue-i18n";

interface BucketDef {
  /** Divisor to convert seconds → unit. */
  divisor: number;
  /** Maximum age in seconds for this bucket. */
  maxAgeSeconds: number;
  /** Intl.RelativeTimeFormat unit. */
  unit: Intl.RelativeTimeFormatUnit;
}

const BUCKETS: readonly BucketDef[] = [
  { maxAgeSeconds: 60, unit: "second", divisor: 1 },
  { maxAgeSeconds: 60 * 60, unit: "minute", divisor: 60 },
  { maxAgeSeconds: 60 * 60 * 24, unit: "hour", divisor: 60 * 60 },
  { maxAgeSeconds: 60 * 60 * 24 * 7, unit: "day", divisor: 60 * 60 * 24 },
  { maxAgeSeconds: 60 * 60 * 24 * 30, unit: "week", divisor: 60 * 60 * 24 * 7 },
  {
    maxAgeSeconds: 60 * 60 * 24 * 365,
    unit: "month",
    divisor: 60 * 60 * 24 * 30,
  },
  {
    maxAgeSeconds: Number.POSITIVE_INFINITY,
    unit: "year",
    divisor: 60 * 60 * 24 * 365,
  },
];

/**
 * Format an absolute timestamp (epoch ms) as "X minutes ago" / "yesterday" /
 * etc. using `Intl.RelativeTimeFormat` in the active vue-i18n locale.
 *
 * Cheap to call but the result is *not* reactive on a clock — it's evaluated
 * at call time. Callers that need ticking should wrap with `useNow` from
 * @vueuse/core or trigger a re-render via key.
 */
export function formatRelativeTime(
  timestampMs: number,
  locale: Locale,
  now: number = Date.now()
): string {
  const ageSeconds = Math.max(0, Math.round((now - timestampMs) / 1000));
  const bucket =
    BUCKETS.find((b) => ageSeconds < b.maxAgeSeconds) ?? BUCKETS.at(-1);
  if (!bucket) {
    return "";
  }
  const value = -Math.round(ageSeconds / bucket.divisor);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    value,
    bucket.unit
  );
}

/**
 * Reactive variant: returns a computed that re-evaluates when the locale
 * changes. Doesn't tick on its own — pass a reactive `now` if you want that.
 */
export function useRelativeTime(
  timestampMs: () => number | null,
  now: () => number = () => Date.now()
): ComputedRef<string> {
  const { locale } = useI18n();
  return computed(() => {
    const ts = timestampMs();
    if (ts == null) {
      return "";
    }
    return formatRelativeTime(ts, locale.value as Locale, now());
  });
}
