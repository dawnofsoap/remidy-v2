import { formatInstant } from '@remidy/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { RequestFailure } from '../../core/session.ts';
import { Button, ErrorState, LoadingState, TextField, toast } from '../../ui/index.ts';
import { fetchLogoDevSetting, LOGO_DEV_KEY, removeLogoDevKeys, saveLogoDevKeys } from './api.ts';

/** Administration: setting up Logo.dev, which finds logos for bills by their names. */
export function LogoDevSettings() {
  const setting = useQuery({ queryKey: LOGO_DEV_KEY, queryFn: fetchLogoDevSetting });
  const queryClient = useQueryClient();
  const [publishableKey, setPublishableKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function run(change: () => Promise<unknown>, message: string) {
    setBusy(true);
    setErrors({});
    try {
      await change();
      await queryClient.invalidateQueries({ queryKey: LOGO_DEV_KEY });
      setPublishableKey('');
      setSecretKey('');
      toast.success(message);
    } catch (error) {
      if (error instanceof RequestFailure && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
      } else {
        toast.error(error instanceof RequestFailure ? error.message : 'That didn’t work.');
      }
    } finally {
      setBusy(false);
    }
  }

  function save(event: SyntheticEvent) {
    event.preventDefault();
    void run(() => saveLogoDevKeys({ publishableKey, secretKey }), 'Logo.dev is set up.');
  }

  if (setting.isPending) return <LoadingState label="Loading the Logo.dev setting" />;
  if (setting.isError) {
    return (
      <ErrorState message="The setting couldn’t load." onRetry={() => void setting.refetch()} />
    );
  }

  const { configured, updatedAt } = setting.data;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2 text-ink-2">
        <p>
          Remidy finds each bill’s logo on its own website. With{' '}
          <a href="https://www.logo.dev" className="text-accent-text underline" rel="noreferrer">
            Logo.dev
          </a>{' '}
          set up, it also searches by the bill’s name, which finds far more.
        </p>
        <p>
          While it’s set up, bill names are sent to Logo.dev to search. Its free plan is for
          personal use, such as a household’s own copy of Remidy.
        </p>
      </div>
      <p className="font-semibold">
        {configured
          ? `Set up${updatedAt ? `, last changed ${formatInstant(updatedAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}` : ''}.`
          : 'Not set up.'}
      </p>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Publishable key"
          hint="Starts with pk_. Used to fetch logos."
          autoComplete="off"
          spellCheck={false}
          value={publishableKey}
          onChange={(event) => {
            setPublishableKey(event.target.value);
          }}
          {...(errors.publishableKey ? { error: errors.publishableKey } : {})}
        />
        <TextField
          label="Secret key"
          hint="Starts with sk_. Used to search. Stored encrypted, and never shown again."
          type="password"
          autoComplete="off"
          value={secretKey}
          onChange={(event) => {
            setSecretKey(event.target.value);
          }}
          {...(errors.secretKey ? { error: errors.secretKey } : {})}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {configured ? 'Replace keys' : 'Save keys'}
          </Button>
          {configured ? (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void run(removeLogoDevKeys, 'Logo.dev is no longer used.')}
            >
              Stop using Logo.dev
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
