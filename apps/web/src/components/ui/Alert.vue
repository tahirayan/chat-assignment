<script setup lang="ts">
  import { computed } from "vue";

  type Kind = "info" | "success" | "warning" | "error";

  const props = withDefaults(defineProps<{ kind?: Kind }>(), { kind: "info" });

  const cls = computed(() => {
    switch (props.kind) {
      case "success":
        return "border-success/30 bg-success/10 text-text";
      case "warning":
        return "border-warning/30 bg-warning/10 text-text";
      case "error":
        return "border-danger/30 bg-danger/10 text-text";
      default:
        return "border-brand-200 bg-brand-50 text-text";
    }
  });
</script>

<template>
  <div role="alert" class="rounded-lg border px-3 py-2 text-sm" :class="cls">
    <slot />
  </div>
</template>
