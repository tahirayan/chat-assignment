<script setup lang="ts">
  /**
   * Stripe Payment Element host (PRD §15.4).
   *
   *   1. On mount, POST /api/payments/create-intent → { clientSecret }
   *   2. Lazy-load @stripe/stripe-js so it doesn't ship in the main bundle
   *   3. Mount the Payment Element into our slot div
   *   4. On submit: stripe.confirmPayment({ return_url: /profile?payment=… })
   *   5. Stripe redirects back to /profile with the intent in the query
   *      string; ProfileView reads the status and toasts the outcome.
   */
  import type { CreateIntentResponse } from "@chat/shared-types";
  import type { Stripe, StripeElements } from "@stripe/stripe-js";
  import { onBeforeUnmount, onMounted, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { api } from "../api/client";
  import BaseButton from "../components/ui/BaseButton.vue";
  import ErrorState from "../components/ui/ErrorState.vue";
  import LoadingState from "../components/ui/LoadingState.vue";

  const { t } = useI18n();

  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
    | string
    | undefined;

  const status = ref<"idle" | "loading" | "ready" | "submitting" | "error">(
    publishableKey ? "loading" : "idle"
  );
  const errorMessage = ref<string | null>(null);

  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  // Holds the DOM node the Payment Element mounts into. We `unmount()` it on
  // unmount/teardown so navigating away mid-flow doesn't leave a detached
  // Stripe iframe holding a card number.
  const paymentSlot = ref<HTMLDivElement | null>(null);

  async function bootstrap(): Promise<void> {
    if (!publishableKey) {
      status.value = "idle";
      return;
    }
    status.value = "loading";
    errorMessage.value = null;
    try {
      // Fetch the client secret + lazy-load Stripe in parallel — both are
      // network-bound and independent.
      const [{ data }, { loadStripe }] = await Promise.all([
        api.post<CreateIntentResponse>("/payments/create-intent"),
        import("@stripe/stripe-js"),
      ]);

      stripe = await loadStripe(publishableKey);
      if (!stripe) {
        throw new Error("Stripe failed to load");
      }
      elements = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: { theme: "stripe" },
      });
      const paymentElement = elements.create("payment");
      if (!paymentSlot.value) {
        throw new Error("Payment slot not mounted");
      }
      paymentElement.mount(paymentSlot.value);
      status.value = "ready";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console — surface for dev diagnosis
      window.console.warn("[upgrade] bootstrap failed", message);
      errorMessage.value = t("upgrade.loadError");
      status.value = "error";
    }
  }

  async function onSubmit(): Promise<void> {
    if (!(stripe && elements) || status.value !== "ready") {
      return;
    }
    status.value = "submitting";
    errorMessage.value = null;

    // confirmPayment either redirects (most happy paths / 3DS) and never
    // resolves, or it returns with `error` describing why we stayed put.
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/profile`,
      },
    });

    if (result.error) {
      // Card declined / validation — stay on the page so the user can fix.
      errorMessage.value = result.error.message ?? t("upgrade.failed");
      status.value = "ready";
    }
  }

  onMounted(bootstrap);
  onBeforeUnmount(() => {
    // Clearing references lets the Stripe iframes get garbage-collected.
    stripe = null;
    elements = null;
  });
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
    <header>
      <h2 class="text-xl font-semibold">{{ t("upgrade.title") }}</h2>
      <p class="mt-1 text-sm text-text-muted">{{ t("upgrade.blurb") }}</p>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="text-3xl font-bold">{{ t("upgrade.price") }}</span>
        <span class="text-sm text-text-muted"
          >{{ t("upgrade.priceCaption") }}</span
        >
      </div>
    </header>

    <!-- Stripe not configured (no VITE_STRIPE_PUBLISHABLE_KEY). -->
    <div
      v-if="!publishableKey"
      class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      {{ t("upgrade.notConfigured") }}
    </div>

    <LoadingState v-else-if="status === 'loading'" />

    <ErrorState
      v-else-if="status === 'error'"
      :description="errorMessage ?? undefined"
      @retry="bootstrap"
    />

    <form
      v-show="publishableKey && (status === 'ready' || status === 'submitting')"
      class="flex flex-col gap-4"
      @submit.prevent="onSubmit"
    >
      <!-- Stripe mounts its iframe into this div. -->
      <div ref="paymentSlot" class="min-h-[12rem]" />

      <p v-if="errorMessage" class="text-sm text-danger" role="alert">
        {{ errorMessage }}
      </p>

      <BaseButton
        type="submit"
        variant="default"
        :loading="status === 'submitting'"
        :disabled="status !== 'ready'"
      >
        {{ status === "submitting" ? t("upgrade.submitting") : t("upgrade.submit") }}
      </BaseButton>
    </form>
  </div>
</template>
