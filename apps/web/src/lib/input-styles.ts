/**
 * Shared Tailwind class strings for BaseInput / BaseTextarea / BaseSelect.
 *
 * The three components render different elements but share the same
 * visual surface: linen-plate fill, ink bottom rule, phosphor focus
 * stripe. Keeping the strings here means any colour or padding tweak
 * is a one-file change.
 */
export const INPUT_BASE =
  "block w-full rounded-none border-0 border-b border-text bg-surface-muted px-3 py-2.5 font-sans text-sm leading-tight text-text transition-[box-shadow] duration-150 placeholder:text-text-muted/70 focus:border-b-text focus:outline-none focus:[box-shadow:0_3px_0_0_var(--color-brand-500)] disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-60";

export const INPUT_INVALID =
  "border-b-danger focus:border-b-danger focus:[box-shadow:0_3px_0_0_var(--color-danger)]";
