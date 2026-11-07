import type { AnyRoute } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** A part of the Settings page that a feature adds, so Settings doesn't need to know about it. */
export interface SettingsSection {
  title: string;
  component: ComponentType;
}

export interface WebFeature {
  name: string;
  /** A flagged feature stays hidden unless the server reports it as enabled. */
  flagged?: boolean;
  routes: AnyRoute[];
  nav: NavItem[];
  settings?: SettingsSection[];
}

export function defineFeature(feature: WebFeature): WebFeature {
  return feature;
}

const visible = (features: WebFeature[], enabled: readonly string[]) =>
  features.filter((feature) => !feature.flagged || enabled.includes(feature.name));

export function visibleNav(features: WebFeature[], enabled: readonly string[]): NavItem[] {
  return visible(features, enabled).flatMap((feature) => feature.nav);
}

export function visibleSettings(
  features: WebFeature[],
  enabled: readonly string[],
): SettingsSection[] {
  return visible(features, enabled).flatMap((feature) => feature.settings ?? []);
}
