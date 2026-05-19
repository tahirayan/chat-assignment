import "./styles/theme.css";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { detectInitial, i18n, setLocale } from "./i18n";
import router from "./router";

// Preload the user's active locale before mount so the first paint isn't
// in English when they prefer Turkish/Estonian. EN stays bundled (it's
// the fallback); non-EN locales are tiny (~2 KB) and parallelized with
// the main JS chunk, so this doesn't extend the critical chain.
await setLocale(detectInitial()).catch(() => undefined);

const app = createApp(App);

app.use(createPinia());
app.use(i18n);
app.use(router);
app.mount("#root");
