<script setup lang="ts">
  /**
   * Vue port of the facehash React component (npm: facehash).
   *
   * Why a port and not the npm package: facehash's main entry eagerly
   * imports React (forwardRef components for every face), so installing
   * it pulls react + react-dom into our Vue bundle (~48 KB to UserAvatar
   * chunk in our build). The package gives us nothing we can't reproduce
   * in Vue. The deterministic hash, the four face geometries, and the
   * gradient-overlay treatment are all reproduced 1:1 from upstream.
   *
   * Editorial-redesign additions:
   *   • Each face blinks on a long, per-instance random interval (CSS
   *     keyframe `facehash-blink`, eyes only — scaleY hits 0.05 for one
   *     frame then springs back).
   *   • Hover lifts the face 2 px and tilts it −3°, like a polaroid
   *     being picked up off the table.
   *   • Optional `stamp` prop frames the face with a thin parchment
   *     ring + 1 px ink hairline, for hero placements (HomeView).
   */
  import { computed } from "vue";

  // Identical to `stringHash` in the facehash npm package — kept inline
  // so we don't pay React's bundle cost just to call four lines of math.
  // Bitwise ops are the whole point: shift+xor mimics djb2-ish hashing.
  function stringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      // biome-ignore lint/suspicious/noBitwiseOperators: deliberate djb2-style mix to match upstream facehash byte-for-byte
      hash = (hash << 5) - hash + str.charCodeAt(i);
      // biome-ignore lint/suspicious/noBitwiseOperators: truncate to int32 to match upstream facehash
      hash &= hash;
    }
    return Math.abs(hash);
  }

  const props = withDefaults(
    defineProps<{
      name: string;
      /** Size in px. Render fills 100% so the parent's box is authoritative. */
      size?: number;
      /** Show the first letter beneath the face. */
      showInitial?: boolean;
      /** Wraps the face in a parchment-frame ring for hero placements. */
      stamp?: boolean;
    }>(),
    { size: 40, showInitial: true, stamp: false }
  );

  // Default palette — warm-leaning hues that read well on our cream surface.
  const PALETTE: readonly [string, string][] = [
    ["oklch(0.72 0.16 30)", "oklch(0.62 0.18 25)"],
    ["oklch(0.74 0.14 75)", "oklch(0.64 0.16 60)"],
    ["oklch(0.72 0.14 145)", "oklch(0.6 0.16 155)"],
    ["oklch(0.7 0.13 220)", "oklch(0.58 0.15 230)"],
    ["oklch(0.7 0.15 290)", "oklch(0.6 0.17 300)"],
    ["oklch(0.74 0.14 340)", "oklch(0.62 0.17 350)"],
    ["oklch(0.7 0.12 180)", "oklch(0.58 0.14 195)"],
    ["oklch(0.72 0.15 50)", "oklch(0.6 0.18 40)"],
  ] as const;

  const seed = computed(() => stringHash(props.name || "?"));
  const faceIndex = computed(() => seed.value % 4);
  const paletteIndex = computed(() => seed.value % PALETTE.length);
  const initial = computed(() => (props.name.charAt(0) || "?").toUpperCase());

  const FALLBACK: readonly [string, string] = [
    "oklch(0.7 0.13 60)",
    "oklch(0.6 0.15 50)",
  ] as const;
  const colors = computed<readonly [string, string]>(
    () => PALETTE[paletteIndex.value] ?? FALLBACK
  );

  // Per-instance random delays (derived from the hash so they're stable
  // per user). Total blink cycle ~6–10s, eyes blink ~0.18s. Left and
  // right eyes drift slightly so the wink looks alive rather than
  // robotic.
  const cycle = computed(() => 5 + (seed.value % 6)); // 5–10s
  const delayL = computed(() => ((seed.value * 0.13) % cycle.value).toFixed(2));
  const delayR = computed(() =>
    ((seed.value * 0.31 + 0.4) % cycle.value).toFixed(2)
  );

  const rootStyle = computed(() => ({
    width: `${props.size}px`,
    height: `${props.size}px`,
    background: `linear-gradient(135deg, ${colors.value[0]} 0%, ${colors.value[1]} 100%)`,
  }));

  const eyeStyleL = computed(
    () =>
      `animation: facehash-blink ${cycle.value}s ease-in-out ${delayL.value}s infinite; transform-origin: center;`
  );
  const eyeStyleR = computed(
    () =>
      `animation: facehash-blink ${cycle.value}s ease-in-out ${delayR.value}s infinite; transform-origin: center;`
  );
</script>

<template>
  <div
    :class="[
      'facehash-root group relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform duration-200 ease-out',
      stamp ? 'ring-1 ring-text ring-offset-4 ring-offset-surface' : '',
    ]"
    :style="rootStyle"
    role="img"
    :aria-label="name"
  >
    <!-- Soft radial highlight — like studio top-light on a face. -->
    <div
      class="pointer-events-none absolute inset-0"
      style="
        background: radial-gradient(
          ellipse 100% 100% at 50% 30%,
          rgb(255 255 255 / 0.22) 0%,
          transparent 60%
        );
      "
      aria-hidden="true"
    />

    <div
      class="relative z-10 flex flex-col items-center justify-center"
      style="color: rgb(255 255 255 / 0.92)"
    >
      <!-- Round eyes -->
      <svg
        v-if="faceIndex === 0"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 63 15"
        xmlns="http://www.w3.org/2000/svg"
        :style="{ width: `${size * 0.5}px`, height: 'auto' }"
      >
        <g :style="eyeStyleL">
          <circle cx="7.2" cy="7.2" fill="currentColor" r="7.2" />
        </g>
        <g :style="eyeStyleR">
          <circle cx="55.2" cy="7.2" fill="currentColor" r="7.2" />
        </g>
      </svg>

      <!-- Cross eyes -->
      <svg
        v-else-if="faceIndex === 1"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 71 23"
        xmlns="http://www.w3.org/2000/svg"
        :style="{ width: `${size * 0.55}px`, height: 'auto' }"
      >
        <g :style="eyeStyleL">
          <rect
            fill="currentColor"
            height="23"
            rx="3.5"
            width="7"
            x="8"
            y="0"
          />
          <rect
            fill="currentColor"
            height="7"
            rx="3.5"
            width="23"
            x="0"
            y="8"
          />
        </g>
        <g :style="eyeStyleR">
          <rect
            fill="currentColor"
            height="23"
            rx="3.5"
            width="7"
            x="55.2"
            y="0"
          />
          <rect
            fill="currentColor"
            height="7"
            rx="3.5"
            width="23"
            x="47.3"
            y="8"
          />
        </g>
      </svg>

      <!-- Line eyes (sleepy bar) -->
      <svg
        v-else-if="faceIndex === 2"
        aria-hidden="true"
        fill="none"
        viewBox="0 0 82 8"
        xmlns="http://www.w3.org/2000/svg"
        :style="{ width: `${size * 0.6}px`, height: 'auto' }"
      >
        <g :style="eyeStyleL">
          <rect
            fill="currentColor"
            height="6.9"
            rx="3.5"
            width="6.9"
            x="0.07"
            y="0.16"
          />
          <rect
            fill="currentColor"
            height="6.9"
            rx="3.5"
            width="20.7"
            x="7.9"
            y="0.16"
          />
        </g>
        <g :style="eyeStyleR">
          <rect
            fill="currentColor"
            height="6.9"
            rx="3.5"
            width="6.9"
            x="74.7"
            y="0.16"
          />
          <rect
            fill="currentColor"
            height="6.9"
            rx="3.5"
            width="20.7"
            x="53.1"
            y="0.16"
          />
        </g>
      </svg>

      <!-- Curved eyes (happy/closed) -->
      <svg
        v-else
        aria-hidden="true"
        fill="none"
        viewBox="0 0 63 9"
        xmlns="http://www.w3.org/2000/svg"
        :style="{ width: `${size * 0.55}px`, height: 'auto' }"
      >
        <g :style="eyeStyleL">
          <path
            d="M0 5.1c0-.1 0-.2 0-.3.1-.5.3-1 .7-1.3.1 0 .1-.1.2-.1C2.4 2.2 6 0 10.5 0S18.6 2.2 20.2 3.3c.1 0 .1.1.1.1.4.3.7.9.7 1.3v.3c0 1 0 1.4 0 1.7-.2 1.3-1.2 1.9-2.5 1.6-.2 0-.7-.3-1.8-.8C15 6.7 12.8 6 10.5 6s-4.5.7-6.3 1.5c-1 .5-1.5.7-1.8.8-1.3.3-2.3-.3-2.5-1.6v-1.7z"
            fill="currentColor"
          />
        </g>
        <g :style="eyeStyleR">
          <path
            d="M42 5.1c0-.1 0-.2 0-.3.1-.5.3-1 .7-1.3.1 0 .1-.1.2-.1C44.4 2.2 48 0 52.5 0S60.6 2.2 62.2 3.3c.1 0 .1.1.1.1.4.3.7.9.7 1.3v.3c0 1 0 1.4 0 1.7-.2 1.3-1.2 1.9-2.5 1.6-.2 0-.7-.3-1.8-.8C57 6.7 54.8 6 52.5 6s-4.5.7-6.3 1.5c-1 .5-1.5.7-1.8.8-1.3.3-2.3-.3-2.5-1.6v-1.7z"
            fill="currentColor"
          />
        </g>
      </svg>

      <span
        v-if="showInitial"
        class="select-none font-medium leading-none"
        :style="{
          marginTop: `${size * 0.08}px`,
          fontSize: `${Math.max(10, size * 0.26)}px`,
        }"
      >
        {{ initial }}
      </span>
    </div>
  </div>
</template>

<style scoped>
  @keyframes facehash-blink {
    0%,
    92%,
    100% {
      transform: scaleY(1);
    }
    94%,
    96% {
      transform: scaleY(0.05);
    }
  }

  /*
             * Hover behaviour: the face lifts and tilts a few degrees, like
             * picking up a polaroid. The tilt is intentionally NOT applied to
             * the root in the stamp variant — heroes already feel grand without
             * it, and rotating them would clip the ring offset.
             */
  .facehash-root:hover {
    transform: translateY(-1px) rotate(-2deg);
  }
  .facehash-root.ring-1:hover {
    transform: translateY(-1px) rotate(0);
  }
</style>
