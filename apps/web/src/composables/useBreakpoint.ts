import { useMediaQuery } from "@vueuse/core";
import { type ComputedRef, computed, type Ref } from "vue";

interface BreakpointApi {
  isLg: Ref<boolean>;
  isMd: Ref<boolean>;
  isMobile: ComputedRef<boolean>;
}

/**
 * Reactive viewport queries. Tailwind's `md` = 768px, `lg` = 1024px.
 * Use this at the LAYOUT level, not inside pages — see responsive-layout skill.
 */
export function useBreakpoint(): BreakpointApi {
  const isMd = useMediaQuery("(min-width: 768px)");
  const isLg = useMediaQuery("(min-width: 1024px)");
  return {
    isMd,
    isLg,
    isMobile: computed(() => !isMd.value),
  };
}
