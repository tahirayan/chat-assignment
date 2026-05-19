<script setup lang="ts">
  import type { UpdateProfileInput } from "@chat/shared-contracts";
  import type { Locale, PaymentStatusResponse, User } from "@chat/shared-types";
  import { computed, onMounted, reactive, ref, watch } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRoute, useRouter } from "vue-router";
  import { api } from "../api/client";
  import BaseButton from "../components/ui/BaseButton.vue";
  import BaseInput from "../components/ui/BaseInput.vue";
  import BaseSelect from "../components/ui/BaseSelect.vue";
  import BaseTextarea from "../components/ui/BaseTextarea.vue";
  import FormField from "../components/ui/FormField.vue";
  import ProBadge from "../components/ui/ProBadge.vue";
  import UserAvatar from "../components/ui/UserAvatar.vue";
  import {
    AVATAR_ACCEPT_ATTR,
    type AvatarErrorKey,
    useAvatarUpload,
  } from "../composables/useAvatarUpload";
  import { useBrowserNotifications } from "../composables/useBrowserNotifications";
  import { useNotificationSound } from "../composables/useNotificationSound";
  import { useWebPush } from "../composables/useWebPush";
  import { useAuthStore } from "../stores/auth";
  import { useUiStore } from "../stores/ui";

  const { t } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const authStore = useAuthStore();
  const uiStore = useUiStore();
  const { pickAndProcess } = useAvatarUpload();

  const LOCALES: readonly Locale[] = ["en", "tr", "et"] as const;

  interface Draft {
    avatarUrl: string | null;
    bio: string;
    displayName: string;
    locale: Locale;
  }

  function draftFromUser(u: User | null): Draft {
    return {
      displayName: u?.displayName ?? "",
      bio: u?.bio ?? "",
      avatarUrl: u?.avatarUrl ?? null,
      locale: u?.locale ?? "en",
    };
  }

  const draft = reactive<Draft>(draftFromUser(authStore.user));
  const fileInput = ref<HTMLInputElement | null>(null);
  const isSaving = ref(false);
  const isLoggingOut = ref(false);
  const displayNameError = ref<string | null>(null);

  // Re-seed the draft if the canonical user changes (e.g. after a refresh
  // bootstrap) — but only when there are no unsaved local edits, so we don't
  // clobber in-progress work.
  watch(
    () => authStore.user,
    (u) => {
      if (!isDirty.value) {
        Object.assign(draft, draftFromUser(u));
      }
    }
  );

  const previewUser = computed(() => ({
    avatarUrl: draft.avatarUrl,
    displayName: draft.displayName || "?",
    id: authStore.user?.id ?? "preview",
  }));

  const isDirty = computed(() => {
    const u = authStore.user;
    if (!u) {
      return false;
    }
    return (
      draft.displayName !== u.displayName ||
      draft.bio !== u.bio ||
      draft.avatarUrl !== u.avatarUrl ||
      draft.locale !== u.locale
    );
  });

  const trimmedName = computed(() => draft.displayName.trim());
  const isNameValid = computed(
    () => trimmedName.value.length >= 2 && trimmedName.value.length <= 50
  );
  const isBioValid = computed(() => draft.bio.length <= 280);
  const canSave = computed(
    () =>
      isDirty.value && isNameValid.value && isBioValid.value && !isSaving.value
  );

  function onPickAvatar(): void {
    fileInput.value?.click();
  }

  async function onFileChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file twice still fires `change`.
    input.value = "";
    if (!file) {
      return;
    }
    const result = await pickAndProcess(file);
    if ("error" in result) {
      uiStore.pushToast("error", t(result.error satisfies AvatarErrorKey));
      return;
    }
    draft.avatarUrl = result.dataUrl;
  }

  function onClearAvatar(): void {
    draft.avatarUrl = null;
  }

  function buildPatch(): UpdateProfileInput {
    const u = authStore.user;
    const patch: UpdateProfileInput = {};
    if (!u) {
      return patch;
    }
    if (trimmedName.value !== u.displayName) {
      patch.displayName = trimmedName.value;
    }
    if (draft.bio !== u.bio) {
      patch.bio = draft.bio;
    }
    if (draft.avatarUrl !== u.avatarUrl) {
      patch.avatarUrl = draft.avatarUrl;
    }
    if (draft.locale !== u.locale) {
      patch.locale = draft.locale;
    }
    return patch;
  }

  async function onSave(): Promise<void> {
    displayNameError.value = null;
    if (!isNameValid.value) {
      displayNameError.value = t("profile.displayNameHint");
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      return;
    }
    isSaving.value = true;
    try {
      const updated = await authStore.updateProfile(patch);
      // Apply the locale change to the UI now that the server confirmed it.
      if (patch.locale && patch.locale !== uiStore.locale) {
        uiStore.setLocale(patch.locale);
      }
      Object.assign(draft, draftFromUser(updated));
      uiStore.pushToast("success", t("profile.saveSuccess"));
    } catch {
      uiStore.pushToast("error", t("profile.saveError"));
    } finally {
      isSaving.value = false;
    }
  }

  async function onLogout(): Promise<void> {
    // biome-ignore lint/suspicious/noAlert: native confirm is intentional per PRD §11.6 — a custom modal isn't worth building for a single log-out gate
    if (!window.confirm(t("profile.logoutConfirm"))) {
      return;
    }
    isLoggingOut.value = true;
    try {
      // Drop the Web Push subscription BEFORE logging out — once the
      // access token is cleared, the DELETE /api/push/subscribe call
      // would fail with 401 and leave a stale row.
      await webPush.unsubscribe();
      await authStore.logout();
      await router.push("/auth");
    } finally {
      isLoggingOut.value = false;
    }
  }

  function onUpgrade(): void {
    router.push("/upgrade");
  }

  // ─── Phase 19/20: notification settings ──────────────────────────────
  const browserNotif = useBrowserNotifications();
  const notifSound = useNotificationSound();
  const webPush = useWebPush();

  // The toggle reflects "user wants notifications enabled". That's true
  // when permission is granted AND the user hasn't actively dismissed.
  const notifEnabled = computed({
    get() {
      return (
        browserNotif.permission.value === "granted" &&
        !browserNotif.dismissed.value
      );
    },
    async set(next: boolean) {
      if (next) {
        // Flipping on always re-attempts the prompt — clears the sticky
        // "dismissed" flag from a prior decline so the browser-native
        // prompt can re-raise.
        browserNotif.unDismiss();
        if (browserNotif.permission.value !== "granted") {
          await browserNotif.requestPermission();
        }
        // Always (re-)subscribe to Web Push when the toggle goes on —
        // covers the case where permission was already granted but the
        // user previously toggled off and dropped the subscription.
        if (browserNotif.permission.value === "granted") {
          await webPush.subscribe();
        }
      } else {
        browserNotif.dismiss();
        // Drop the server subscription too so closed-PWA pushes stop.
        await webPush.unsubscribe();
      }
    },
  });

  const soundEnabled = computed({
    get: () => !notifSound.muted.value,
    set: (next: boolean) => notifSound.setMuted(!next),
  });

  const notifsUnsupported = computed(() => !browserNotif.isSupported());
  const notifsBlocked = computed(
    () => browserNotif.permission.value === "denied"
  );

  /**
   * Stripe's `confirmPayment` redirects back here with the intent id in
   * the query string. We translate the status server-side (so the client
   * doesn't trust query params), toast the outcome, and refresh
   * `auth/me` to pick up the freshly-flipped `isPro`. The query params
   * are stripped after handling so a reload doesn't re-toast.
   */
  async function handlePaymentReturn(): Promise<void> {
    const intentId = route.query.payment_intent;
    if (typeof intentId !== "string" || intentId === "") {
      return;
    }
    try {
      const { data } = await api.get<PaymentStatusResponse>(
        "/payments/status",
        { params: { paymentIntentId: intentId } }
      );
      switch (data.status) {
        case "succeeded":
          uiStore.pushToast("success", t("upgrade.success"));
          // Webhook may have already flipped isPro before this fires; the
          // /auth/me refresh is the source of truth either way.
          await api
            .get<User>("/auth/me")
            .then(({ data: me }) => authStore.patchUserLocally(me))
            .catch(() => undefined);
          break;
        case "processing":
          uiStore.pushToast("info", t("upgrade.processing"));
          break;
        case "requires_action":
          uiStore.pushToast("warning", t("upgrade.requiresAction"));
          break;
        default:
          uiStore.pushToast("error", t("upgrade.failed"));
          break;
      }
    } catch {
      uiStore.pushToast("error", t("upgrade.failed"));
    } finally {
      // Strip the Stripe redirect query params so a reload doesn't re-toast.
      const STRIPE_KEYS = new Set([
        "payment_intent",
        "payment_intent_client_secret",
        "redirect_status",
      ]);
      const clean = Object.fromEntries(
        Object.entries(route.query).filter(([k]) => !STRIPE_KEYS.has(k))
      );
      await router.replace({ path: route.path, query: clean });
    }
  }

  onMounted(handlePaymentReturn);
</script>

<template>
  <div class="p-4 max-w-md mx-auto flex flex-col gap-6">
    <header class="flex items-center gap-4">
      <UserAvatar :user="previewUser" :size="64" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-medium truncate">
            {{ authStore.user?.displayName ?? "—" }}
          </h2>
          <ProBadge v-if="authStore.user?.isPro" size="sm" />
        </div>
        <p class="text-sm text-text-muted truncate">
          {{ authStore.user?.email ?? "" }}
        </p>
      </div>
    </header>

    <section class="flex flex-col gap-2">
      <div class="flex gap-2">
        <BaseButton variant="ghost" type="button" @click="onPickAvatar">
          {{ t("avatar.uploadLabel") }}
        </BaseButton>
        <BaseButton
          v-if="draft.avatarUrl"
          variant="ghost"
          type="button"
          @click="onClearAvatar"
        >
          {{ t("avatar.removeLabel") }}
        </BaseButton>
      </div>
      <input
        ref="fileInput"
        type="file"
        :accept="AVATAR_ACCEPT_ATTR"
        class="hidden"
        @change="onFileChange"
      >
    </section>

    <section class="flex flex-col gap-4">
      <FormField
        :label="t('profile.displayName')"
        :error-message="displayNameError"
        :hint="t('profile.displayNameHint')"
      >
        <template #default="{ id, invalid }">
          <BaseInput
            :id="id"
            v-model="draft.displayName"
            type="text"
            autocomplete="name"
            :invalid="invalid"
          />
        </template>
      </FormField>

      <FormField :label="t('profile.bio')" :hint="t('profile.bioHint')">
        <template #default="{ id }">
          <BaseTextarea
            :id="id"
            v-model="draft.bio"
            class="min-h-[5rem] resize-y"
            :placeholder="t('profile.bioPlaceholder')"
            :maxlength="280"
          />
        </template>
      </FormField>

      <FormField :label="t('profile.locale')">
        <template #default="{ id }">
          <BaseSelect :id="id" v-model="draft.locale">
            <option v-for="loc in LOCALES" :key="loc" :value="loc">
              {{ t(`languages.${loc}`) }}
            </option>
          </BaseSelect>
        </template>
      </FormField>

      <div class="flex items-center justify-between">
        <span v-if="isDirty" class="text-xs text-text-muted" aria-live="polite">
          {{ t("profile.unsaved") }}
        </span>
        <span v-else />
        <BaseButton
          type="button"
          variant="default"
          :disabled="!canSave"
          :loading="isSaving"
          @click="onSave"
        >
          {{ t("common.save") }}
        </BaseButton>
      </div>
    </section>

    <section v-if="authStore.user && !authStore.user.isPro" class="pt-6">
      <BaseButton variant="default" type="button" @click="onUpgrade">
        {{ t("profile.upgradeCta") }}
      </BaseButton>
    </section>

    <section class="flex flex-col gap-3 pt-6">
      <h3 class="text-sm font-medium uppercase tracking-wide text-text-muted">
        {{ t("notifications.settings") }}
      </h3>
      <p
        v-if="notifsUnsupported"
        class="rounded-md bg-surface-subtle px-3 py-2 text-xs text-text-muted"
      >
        {{ t("notifications.unsupported") }}
      </p>
      <p
        v-else-if="notifsBlocked"
        class="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        {{ t("notifications.permissionBlocked") }}
      </p>
      <label class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">{{ t("notifications.enable") }}</p>
          <p class="text-xs text-text-muted">
            {{ t("notifications.enableHint") }}
          </p>
        </div>
        <input
          v-model="notifEnabled"
          type="checkbox"
          :disabled="notifsUnsupported || notifsBlocked"
          class="mt-1 h-5 w-5 cursor-pointer accent-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
      </label>
      <label class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">
            {{ t("notifications.soundEnable") }}
          </p>
          <p class="text-xs text-text-muted">
            {{ t("notifications.soundHint") }}
          </p>
        </div>
        <input
          v-model="soundEnabled"
          type="checkbox"
          class="mt-1 h-5 w-5 cursor-pointer accent-brand-500"
        >
      </label>
    </section>

    <section class="pt-6">
      <BaseButton
        type="button"
        variant="destructive"
        :loading="isLoggingOut"
        @click="onLogout"
      >
        {{ t("profile.logout") }}
      </BaseButton>
    </section>
  </div>
</template>
