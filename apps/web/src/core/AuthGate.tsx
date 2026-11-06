import { ADMIN_EMAIL } from '@remidy/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Button,
  ErrorState,
  isPasswordReady,
  LoadingState,
  NewPasswordField,
  TextField,
} from '../ui/index.ts';
import {
  adoptBrowserTimeZone,
  changePassword,
  fetchSession,
  fetchSignInOptions,
  RequestFailure,
  requestPasswordReset,
  resetPassword,
  SESSION_QUERY_KEY,
  signIn,
  SIGN_IN_OPTIONS_QUERY_KEY,
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

function SignInPage({
  adminPasswordInConsole,
  passwordReset,
  onForgot,
}: {
  adminPasswordInConsole: boolean;
  passwordReset: boolean;
  onForgot: () => void;
}) {
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
        {adminPasswordInConsole ? (
          <p className="rounded-xl bg-surface-2 p-3">
            Setting up? Sign in with <strong>{ADMIN_EMAIL}</strong> and the password printed in the
            server’s console.
          </p>
        ) : null}
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
        {passwordReset ? (
          <Button variant="secondary" onClick={onForgot}>
            Forgot your password?
          </Button>
        ) : null}
      </form>
    </AuthShell>
  );
}

function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const { busy, failure, run } = useFormAction();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    void run(async () => {
      await requestPasswordReset(email);
      setSentTo(email);
    });
  }

  const back = (
    <Button variant="secondary" onClick={onBack}>
      Back to sign in
    </Button>
  );

  if (sentTo !== null) {
    return (
      <AuthShell title="Check your email" intro="Your request has been received.">
        <p role="status">
          If {sentTo} has an account, a link to choose a new password is on its way. It works for
          the next hour.
        </p>
        {back}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" intro="We’ll email you a link to choose a new one.">
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
        <Button type="submit" busy={busy}>
          Email me a link
        </Button>
        {back}
      </form>
      <p className="text-sm text-ink-2">
        The admin account has no email address. To replace its password, run the{' '}
        <code>reset-admin-password</code> command on the server.
      </p>
    </AuthShell>
  );
}

/** Where a reset link leads. The token is after the #, so it never reaches a server's logs. */
function ResetPasswordPage() {
  const { busy, failure, run } = useFormAction();
  const [next, setNext] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const newPasswordError = failure?.fields.newPassword;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!isPasswordReady(next)) {
      newPasswordRef.current?.focus();
      return;
    }
    void run(async () => {
      await resetPassword(token ?? '', next);
      window.location.assign('/');
    });
  }

  const startOver = (
    <a href="/" className="font-semibold underline">
      Back to sign in
    </a>
  );

  if (!token) {
    return (
      <AuthShell title="Choose a password" intro="This link isn’t complete.">
        <p role="alert">Open the link from your email again, or ask for a new one.</p>
        {startOver}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a password" intro="This also signs you out on all your devices.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormError failure={failure} />
        <NewPasswordField
          ref={newPasswordRef}
          label="New password"
          required
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
          }}
          {...(newPasswordError ? { error: newPasswordError } : {})}
        />
        <Button type="submit" busy={busy}>
          Save password
        </Button>
      </form>
      {startOver}
    </AuthShell>
  );
}

/** Replaces a generated password, which has been shown in a console, before anything else. */
function ChoosePasswordPage() {
  const queryClient = useQueryClient();
  const { busy, failure, run } = useFormAction();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordError = failure?.fields.newPassword;

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!isPasswordReady(next)) {
      newPasswordRef.current?.focus();
      return;
    }
    void run(async () => {
      await changePassword(current, next);
      await adoptBrowserTimeZone();
      await queryClient.invalidateQueries();
    });
  }

  return (
    <AuthShell
      title="Choose a password"
      intro="The password you signed in with was temporary. Replace it to continue."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormError failure={failure} />
        <TextField
          label="Temporary password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
          }}
        />
        <NewPasswordField
          ref={newPasswordRef}
          label="New password"
          required
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
          }}
          {...(newPasswordError ? { error: newPasswordError } : {})}
        />
        <Button type="submit" busy={busy}>
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}

/** Shows sign-in until someone is signed in with a password of their own, and then the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [forgot, setForgot] = useState(false);
  const options = useQuery({
    queryKey: SIGN_IN_OPTIONS_QUERY_KEY,
    queryFn: fetchSignInOptions,
    retry: false,
  });
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, retry: false });

  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />;
  if (options.isPending || session.isPending) {
    return <LoadingState label="Loading Remidy" />;
  }
  if (options.isError || session.isError) {
    return (
      <ErrorState
        message={SERVER_UNREACHABLE}
        onRetry={() => {
          void options.refetch();
          void session.refetch();
        }}
      />
    );
  }
  if (!session.data) {
    if (forgot) {
      return (
        <ForgotPasswordPage
          onBack={() => {
            setForgot(false);
          }}
        />
      );
    }
    return (
      <SignInPage
        adminPasswordInConsole={options.data.adminPasswordInConsole}
        passwordReset={options.data.passwordReset}
        onForgot={() => {
          setForgot(true);
        }}
      />
    );
  }
  if (session.data.user.mustChangePassword) return <ChoosePasswordPage />;
  return children;
}
