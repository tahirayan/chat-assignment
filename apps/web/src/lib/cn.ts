/**
 * `cn` — the shadcn convention.
 *
 * Combines `clsx` (which flattens conditionals, arrays, and falsy values
 * into a class string) with `tailwind-merge` (which resolves Tailwind
 * conflicts so the latter class wins). Use it whenever you compose a
 * variant string from a component with extra classes passed by a caller.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
