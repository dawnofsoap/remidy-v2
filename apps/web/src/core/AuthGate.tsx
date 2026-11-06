import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Button, ErrorState, LoadingState, TextField } from '../ui/index.ts';
import {
  completeSetup,
  fetchSession,
  fetchSetupStatus,
  RequestFailure,
  SESSION_QUERY_KEY,
  SETUP_QUERY_KEY,
  signIn,
} from './session.ts';

const SERVER_UNREACHABLE = 'Remidy can’t reach the server. Check your connection and try again.';
const UNEXPECTED = 'That didn’t work. Try again.';

function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · Remidy`;
  }, [title]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-bold tracking-tight">Remidy</p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-ink-2">{intro}</p>
      </div>
      {children}
    </main>
  );
}

/** Runs a form's action, tracking whether it's busy and what went wrong. */
function useFormAction() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<RequestFailure | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(error instanceof RequestFailure ? error : new RequestFailure(0, UNEXPECTED));
    } finally {
      setBusy(false);
    }
  }
  return { busy, failure, run };
}

function FormError({ failure }: { failure: RequestFailure | null }) {
  // Field problems show beside their field. A form-level message is only for everything else.
  if (!failure || Object.keys(failure.fields).length > 0) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">
      {failure.message}
    </p>
  );
}

function SignInPage() {
  const queryClient = useQueryClient();
  const { busy, failure, run } = useFormAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    void run(async () => {
      await signIn(email, password);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    });
  }

  return (
    <AuthShell title="Sign in" intro="Welcome back.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormError failure={failure} />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

function SetupPage() {
  const queryClient = useQueryClient();
  const { busy, failure, run } = useFormAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const fieldError = (field: string) => {
    const message = failure?.fields[field];
    return message ? { error: message } : {};
  };

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    void run(async () => {
      await completeSetup({ name, email, password });
      await signIn(email, password);
      await queryClient.invalidateQueries();
    });
  }

  return (
    <AuthShell title="Set up Remidy" intro="Create the first account. It will manage this Remidy.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormError failure={failure} />
        <TextField
          label="Your name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          {...fieldError('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          {...fieldError('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters. A few random words work well."
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          {...fieldError('password')}
        />
        <Button type="submit" busy={busy}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

/** Shows first-run setup or sign-in until someone is signed in, and then the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const setup = useQuery({ queryKey: SETUP_QUERY_KEY, queryFn: fetchSetupStatus, retry: false });
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, retry: false });

  if (setup.isPending || session.isPending) {
    return <LoadingState label="Loading Remidy" />;
  }
  if (setup.isError || session.isError) {
    return (
      <ErrorState
        message={SERVER_UNREACHABLE}
        onRetry={() => {
          void setup.refetch();
          void session.refetch();
        }}
      />
    );
  }
  if (setup.data.needed) return <SetupPage />;
  if (!session.data) return <SignInPage />;
  return children;
}
