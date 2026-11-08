import { useQueryClient } from '@tanstack/react-query';
import { toast } from '../../ui/index.ts';
import { AGENDA_KEY, BILLS_KEY, TOTALS_KEY } from './api.ts';

/** After any change to bills or payments: says what happened, and refreshes everything shown. */
export function useRefresh() {
  const queryClient = useQueryClient();
  return async (message: string) => {
    toast(message);
    await Promise.all(
      [BILLS_KEY, AGENDA_KEY, TOTALS_KEY, ['bill-history']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}
