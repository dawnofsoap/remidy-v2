import type { AnyRoute } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface WebFeature {
  name: string;
  /** A flagged feature stays out of navigation unless the server reports it as enabled. */
  flagged?: boolean;
  routes: AnyRoute[];
  nav: NavItem[];
}

export function defineFeature(feature: WebFeature): WebFeature {
  return feature;
}

export function visibleNav(features: WebFeature[], enabled: readonly string[]): NavItem[] {
  return features
    .filter((feature) => !feature.flagged || enabled.includes(feature.name))
    .flatMap((feature) => feature.nav);
}
