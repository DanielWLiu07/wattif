import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("en-CA", opts).format(n);
}

export function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtCad(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}
