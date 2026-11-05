import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A post-login destination, limited to paths on this site. Anything else becomes the fallback:
 * returnUrl comes from the address bar, so a crafted link can put anything there.
 */
export function safeReturnUrl(value: string | null, fallback = "/dashboard"): string {
  return value && /^\/(?![/\\])/.test(value) ? value : fallback;
}

const ordinalRules = new Intl.PluralRules("en", { type: "ordinal" });
const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

/** 1 -> "1st", 22 -> "22nd", 111 -> "111th". Callers pass an integer (round first). */
export function ordinal(n: number): string {
  return `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)] ?? "th"}`;
}
