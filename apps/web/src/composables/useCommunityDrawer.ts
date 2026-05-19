/**
 * Mobile-only state for the community drawer.
 *
 * Desktop (≥ md) shows CommunityPane permanently as the right column of
 * AppLayout, so this drawer is irrelevant there. On mobile the side
 * panes collapse — this ref controls a slide-in panel triggered from
 * the TopBar's "show community" button. Module-level so TopBar and
 * AppLayout share the same open/close state without prop drilling.
 */
import { ref } from "vue";

const isOpen = ref(false);

export function useCommunityDrawer() {
  return {
    isOpen,
    open: () => {
      isOpen.value = true;
    },
    close: () => {
      isOpen.value = false;
    },
    toggle: () => {
      isOpen.value = !isOpen.value;
    },
  };
}
