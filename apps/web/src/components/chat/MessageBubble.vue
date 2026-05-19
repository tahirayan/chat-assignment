<script setup lang="ts">
  /**
   * Editorial-redesign message note.
   *
   * No bubble. Each message is a slab-cornered "note" with a single
   * ink hairline on its leading edge — own messages have the rule on
   * the right (text aligns right), incoming have it on the left.
   * Body uses Newsreader at 16/24, timestamps + receipts in JetBrains
   * Mono at 11/12 so the data chrome reads as marginalia.
   */
  import type { Message } from "@chat/shared-types";
  import { Tick01Icon, TickDouble01Icon } from "@hugeicons/core-free-icons";
  import { HugeiconsIcon } from "@hugeicons/vue";
  import { computed } from "vue";
  import { useI18n } from "vue-i18n";

  const props = defineProps<{
    message: Message;
    ownId: string;
  }>();

  const isOwn = computed(() => props.message.senderId === props.ownId);

  // UUIDv7 has a "7" at position 14 (the version nibble); v4 returns "4".
  const isOptimistic = computed(
    () => isOwn.value && props.message.id.charAt(14) !== "7"
  );
  const isRead = computed(() => isOwn.value && props.message.readAt !== null);

  const { d, t } = useI18n();

  const timestamp = computed(() =>
    d(new Date(props.message.createdAt), "long")
  );
  const receiptLabel = computed(() =>
    isRead.value ? t("chat.read") : t("chat.sent")
  );
  const receiptState = computed<"pending" | "sent" | "read">(() => {
    if (isOptimistic.value) {
      return "pending";
    }
    return isRead.value ? "read" : "sent";
  });
</script>

<template>
  <div :class="['flex', isOwn ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'group relative max-w-[78%] px-4 py-2.5 transition-opacity',
        isOwn
          ? 'border-r-2 border-r-text bg-surface-subtle pr-5 text-right'
          : 'border-l-2 border-l-text bg-surface-muted/60 pl-5 text-left',
        isOptimistic ? 'opacity-60' : '',
      ]"
    >
      <p
        class="whitespace-pre-wrap break-words font-sans text-sm leading-[1.55] text-text"
      >
        {{ message.body }}
      </p>

      <!-- Mono marginalia footer: read receipt + timestamp on hover -->
      <div
        :class="[
          'mt-1 flex items-center gap-1.5 font-mono text-2xs tracking-wider text-text-muted',
          isOwn ? 'justify-end' : 'justify-start',
        ]"
      >
        <span
          v-if="isOwn"
          :class="[
            'inline-flex shrink-0 items-center',
            isRead ? 'text-text' : 'text-text-muted',
          ]"
          :aria-label="receiptLabel"
          :title="receiptLabel"
        >
          <span
            v-if="receiptState === 'pending'"
            aria-hidden="true"
            class="inline-flex h-3 items-center justify-center text-xs leading-none"
            >·</span
          >
          <HugeiconsIcon
            v-else
            :icon="receiptState === 'read' ? TickDouble01Icon : Tick01Icon"
            :size="12"
            :stroke-width="2"
            color="currentColor"
            aria-hidden="true"
          />
        </span>
        <span
          class="opacity-0 transition group-hover:opacity-100"
          :title="timestamp"
        >
          {{ timestamp }}
        </span>
      </div>
    </div>
  </div>
</template>
