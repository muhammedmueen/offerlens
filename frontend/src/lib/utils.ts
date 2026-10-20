import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ordinalRules = new Intl.PluralRules("en", { type: "ordinal" });
const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

/** 1 -> "1st", 22 -> "22nd", 111 -> "111th". Callers pass an integer (round first). */
export function ordinal(n: number): string {
  return `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)] ?? "th"}`;
}
