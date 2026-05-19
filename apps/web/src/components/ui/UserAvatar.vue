<script setup lang="ts">
  /**
   * UserAvatar — uploaded picture if present, otherwise a deterministic
   * Facehash fallback (PRD §11.9). Seeded from `displayName` so a rename
   * also rolls a new face + updates the initial letter, matching the
   * user-visible identity (WhatsApp/Telegram model).
   */
  import { computed } from "vue";
  import Facehash from "./Facehash.vue";

  interface UserShape {
    avatarUrl: string | null;
    displayName: string;
    id: string;
  }

  const props = withDefaults(
    defineProps<{
      user: UserShape;
      size?: number;
      /** Hero treatment — parchment ring + ink hairline around the face. */
      stamp?: boolean;
    }>(),
    { size: 40, stamp: false }
  );

  const seed = computed(() => props.user.displayName || props.user.id || "?");

  const imgStyle = computed(() => ({
    width: `${props.size}px`,
    height: `${props.size}px`,
  }));
</script>

<template>
  <img
    v-if="user.avatarUrl"
    :src="user.avatarUrl"
    :alt="user.displayName"
    class="rounded-full object-cover"
    :style="imgStyle"
  >
  <Facehash
    v-else
    :name="seed"
    :size="size"
    :stamp="stamp"
    :aria-label="user.displayName"
  />
</template>
