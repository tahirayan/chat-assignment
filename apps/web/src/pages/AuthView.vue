<script setup lang="ts">
  import { loginInput, registerInput } from "@chat/shared-contracts";
  import { toTypedSchema } from "@vee-validate/zod";
  import { isAxiosError } from "axios";
  import { useForm } from "vee-validate";
  import { computed, ref } from "vue";
  import { useI18n } from "vue-i18n";
  import { useRouter } from "vue-router";
  import Alert from "../components/ui/Alert.vue";
  import BaseButton from "../components/ui/BaseButton.vue";
  import BaseInput from "../components/ui/BaseInput.vue";
  import FormField from "../components/ui/FormField.vue";
  import { useAuthStore } from "../stores/auth";

  type Mode = "login" | "register";

  interface FormValues {
    displayName: string;
    email: string;
    password: string;
  }

  const mode = ref<Mode>("login");
  const isLogin = computed(() => mode.value === "login");
  const serverError = ref<string | null>(null);

  const { t } = useI18n();
  const router = useRouter();
  const authStore = useAuthStore();

  const validationSchema = computed(() =>
    toTypedSchema(isLogin.value ? loginInput : registerInput)
  );

  // Type the form against the widest shape (RegisterValues) so `displayName`
  // is always known, even when the active schema (loginInput) doesn't list it.
  // Initial values are explicit empty strings to avoid `string | undefined`
  // flowing into the `BaseInput` v-model bindings.
  const { handleSubmit, errors, defineField, isSubmitting, resetForm } =
    useForm<FormValues>({
      validationSchema,
      initialValues: { email: "", password: "", displayName: "" },
    });

  const [email] = defineField("email");
  const [password] = defineField("password");
  const [displayName] = defineField("displayName");

  function messageForError(code: string | undefined): string {
    switch (code) {
      case "INVALID_CREDENTIALS":
        return t("auth.errors.invalidCredentials");
      case "EMAIL_TAKEN":
        return t("auth.errors.emailTaken");
      default:
        return t("auth.errors.generic");
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    serverError.value = null;
    try {
      if (isLogin.value) {
        await authStore.login(values.email, values.password);
      } else {
        await authStore.register(
          values.email,
          values.password,
          values.displayName
        );
      }
      await router.push("/");
    } catch (err) {
      const code = isAxiosError(err)
        ? (err.response?.data as { error?: { code?: string } } | undefined)
            ?.error?.code
        : undefined;
      serverError.value = messageForError(code);
    }
  });

  function switchMode(next: Mode): void {
    if (mode.value === next) {
      return;
    }
    mode.value = next;
    serverError.value = null;
    resetForm();
  }
</script>

<template>
  <div class="flex flex-col gap-5">
    <div
      class="grid grid-cols-2 rounded-lg bg-surface-muted p-1"
      role="tablist"
      :aria-label="t('auth.title')"
    >
      <button
        :class="[
          'h-9 rounded-md text-sm font-medium transition',
          isLogin
            ? 'bg-surface text-text shadow-sm'
            : 'text-text-muted hover:text-text',
        ]"
        :aria-selected="isLogin"
        role="tab"
        type="button"
        @click="switchMode('login')"
      >
        {{ t("auth.loginTab") }}
      </button>
      <button
        :class="[
          'h-9 rounded-md text-sm font-medium transition',
          isLogin
            ? 'text-text-muted hover:text-text'
            : 'bg-surface text-text shadow-sm',
        ]"
        :aria-selected="!isLogin"
        role="tab"
        type="button"
        @click="switchMode('register')"
      >
        {{ t("auth.registerTab") }}
      </button>
    </div>

    <p class="text-sm text-text-muted text-center">
      {{ isLogin ? t("auth.subtitleLogin") : t("auth.subtitleRegister") }}
    </p>

    <Alert v-if="serverError" kind="error"> {{ serverError }} </Alert>

    <form class="flex flex-col gap-4" novalidate @submit="onSubmit">
      <FormField
        v-if="!isLogin"
        :label="t('auth.displayName')"
        :error-message="errors.displayName"
      >
        <template #default="field">
          <BaseInput
            :id="field.id"
            v-model="displayName"
            type="text"
            autocomplete="name"
            :placeholder="t('auth.displayNamePlaceholder')"
            :invalid="field.invalid"
          />
        </template>
      </FormField>

      <FormField :label="t('auth.email')" :error-message="errors.email">
        <template #default="field">
          <BaseInput
            :id="field.id"
            v-model="email"
            type="email"
            autocomplete="email"
            :placeholder="t('auth.emailPlaceholder')"
            :invalid="field.invalid"
          />
        </template>
      </FormField>

      <FormField
        :label="t('auth.password')"
        :error-message="errors.password"
        :hint="isLogin ? undefined : t('auth.passwordHint')"
      >
        <template #default="field">
          <BaseInput
            :id="field.id"
            v-model="password"
            type="password"
            :autocomplete="isLogin ? 'current-password' : 'new-password'"
            :invalid="field.invalid"
          />
        </template>
      </FormField>

      <BaseButton type="submit" variant="default" :loading="isSubmitting">
        {{ isLogin ? t("auth.submitLogin") : t("auth.submitRegister") }}
      </BaseButton>
    </form>

    <p class="text-sm text-text-muted text-center">
      <button
        class="font-medium text-brand-600 hover:underline"
        type="button"
        @click="switchMode(isLogin ? 'register' : 'login')"
      >
        {{ isLogin ? t("auth.switchToRegister") : t("auth.switchToLogin") }}
      </button>
    </p>
  </div>
</template>
