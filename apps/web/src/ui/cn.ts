import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, letting later Tailwind classes override earlier conflicting ones. */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}

/** The keyboard focus ring shared by every interactive component. */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
