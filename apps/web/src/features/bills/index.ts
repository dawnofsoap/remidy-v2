import { createRoute } from '@tanstack/react-router';
import { ReceiptText } from 'lucide-react';
import { defineFeature } from '../../core/feature.ts';
import { rootRoute } from '../../core/router.tsx';
import { Agenda } from './components/Agenda.tsx';
import { BillsPage } from './components/BillsPage.tsx';

/** Bills, and what's due across all of them on Home. */
export const bills = defineFeature({
  name: 'bills',
  // Off until it's been tried for real.
  flagged: true,
  routes: [createRoute({ getParentRoute: () => rootRoute, path: '/bills', component: BillsPage })],
  nav: [{ to: '/bills', label: 'Bills', icon: ReceiptText }],
  home: [Agenda],
});
