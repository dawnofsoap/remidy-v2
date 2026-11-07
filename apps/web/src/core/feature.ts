import type { AnyRoute } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** One part of a settings area, with its own address. */
export interface SettingsSection {
  /** The last part of its address, such as `security`. */
  slug: string;
  title: string;
  component: ComponentType;
}

export interface WebFeature {
  name: string;
  /** A flagged feature stays hidden unless the server reports it as enabled. */
  flagged?: boolean;
  routes: AnyRoute[];
  nav: NavItem[];
  /**
   * Sections about shared lists such as categories. They appear in Household, or in Settings for
   * someone without a household, and use `useSettingsSpace` to know which space they're about.
   */
  spaceSettings?: SettingsSection[];
  /** What this feature shows on Home, such as the agenda. Home shows a welcome when nothing does. */
  home?: ComponentType[];
}

export function defineFeature(feature: WebFeature): WebFeature {
  return feature;
}

const visible = (features: WebFeature[], enabled: readonly string[]) =>
  features.filter((feature) => !feature.flagged || enabled.includes(feature.name));

export function visibleNav(features: WebFeature[], enabled: readonly string[]): NavItem[] {
  return visible(features, enabled).flatMap((feature) => feature.nav);
}

export function visibleHome(features: WebFeature[], enabled: readonly string[]): ComponentType[] {
  return visible(features, enabled).flatMap((feature) => feature.home ?? []);
}

export function visibleSpaceSettings(
  features: WebFeature[],
  enabled: readonly string[],
): SettingsSection[] {
  return visible(features, enabled).flatMap((feature) => feature.spaceSettings ?? []);
}
