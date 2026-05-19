import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { i18n } from "./i18n";
import router from "./router";
import { useAuthStore } from "./stores/auth";

describe("App", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Skip the real /api/auth/refresh probe — jsdom has no server.
    vi.spyOn(useAuthStore(), "bootstrap").mockResolvedValue(undefined);
  });

  // biome-ignore lint/suspicious/noSkippedTests: re-enable once a Windows path quirk in a transitive vite-plugin-pwa pre-bundling pass is sorted. The runtime path works; only the jsdom test environment chokes on file:// URLs without drive letters. Re-enable when icon manifest entries no longer trigger fs.readFileSync(new URL('file:///icons/...')).
  it.skip("renders the auth layout when navigated to /auth (unauth)", async () => {
    await router.push("/auth");
    await router.isReady();
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), i18n, router] },
    });
    // AuthLayout has the app name as its h1.
    expect(wrapper.text()).toContain("Lylia Chat");
  });
});
