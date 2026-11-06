import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  changePassword,
  fetchOtherSessionCount,
  fetchSession,
  fetchSpaces,
  RequestFailure,
  revokeOtherSessions,
  SESSION_QUERY_KEY,
  signOut,
  updateSpace,
} from '../../core/session.ts';
import {
  Button,
  isPasswordReady,
  NewPasswordField,
  SelectField,
  TextField,
  toast,
} from '../../ui/index.ts';
import { JobStatus } from './JobStatus.tsx';

const OTHER_SESSIONS_KEY = ['other-sessions'];

function failureMessage(error: unknown): string {
  return error instanceof RequestFailure ? error.message : 'That didn’t work. Try again.';
}

function ChangePasswordForm() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!isPasswordReady(next)) {
      newPasswordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setNewPasswordError(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Password changed. Other devices were signed out.');
      await queryClient.invalidateQueries({ queryKey: OTHER_SESSIONS_KEY });
    } catch (failure) {
      const onNewPassword = failure instanceof RequestFailure && failure.fields.newPassword;
      if (onNewPassword) setNewPasswordError(onNewPassword);
      else setError(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold">Change password</h2>
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <TextField
        label="Current password"
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
        hint="Changing it signs out your other devices."
        required
        value={next}
        onChange={(event) => {
          setNext(event.target.value);
          setNewPasswordError(null);
        }}
        {...(newPasswordError ? { error: newPasswordError } : {})}
      />
      <Button type="submit" variant="secondary" busy={busy} className="self-start">
        Change password
      </Button>
    </form>
  );
}

function SessionControls() {
  const queryClient = useQueryClient();
  const others = useQuery({ queryKey: OTHER_SESSIONS_KEY, queryFn: fetchOtherSessionCount });
  const count = others.data ?? 0;

  async function signOutOthers() {
    try {
      await revokeOtherSessions();
      toast('Other devices were signed out.');
      await queryClient.invalidateQueries({ queryKey: OTHER_SESSIONS_KEY });
    } catch (failure) {
      toast(failureMessage(failure));
    }
  }

  async function signOutHere() {
    try {
      await signOut();
      // Forget everything cached for this account before showing sign-in.
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      window.location.assign('/');
    } catch (failure) {
      toast(failureMessage(failure));
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Devices</h2>
      <p className="text-ink-2">
        {count === 0
          ? 'You’re only signed in on this device.'
          : `You’re also signed in on ${String(count)} other ${count === 1 ? 'device' : 'devices'}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {count > 0 ? (
          <Button variant="secondary" onClick={() => void signOutOthers()}>
            Sign out other devices
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => void signOutHere()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}

function TimeZoneSetting() {
  const queryClient = useQueryClient();
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: fetchSpaces });
  const personal = spaces.data?.find((space) => space.kind === 'personal');
  if (!personal) return null;

  const zones = Intl.supportedValuesOf('timeZone');
  const options = zones.includes(personal.timeZone) ? zones : [personal.timeZone, ...zones];

  async function save(timeZone: string, spaceId: string) {
    try {
      await updateSpace(spaceId, { timeZone });
      toast('Time zone saved.');
      await queryClient.invalidateQueries({ queryKey: ['spaces'] });
    } catch (failure) {
      toast(failureMessage(failure));
    }
  }

  return (
    <section className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-semibold">Your space</h2>
      <SelectField
        label="Time zone"
        hint="Decides when a bill counts as due today."
        value={personal.timeZone}
        onChange={(event) => void save(event.target.value, personal.id)}
      >
        {options.map((zone) => (
          <option key={zone}>{zone}</option>
        ))}
      </SelectField>
    </section>
  );
}

export function AccountSettings() {
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession });
  return (
    <div className="flex flex-col gap-8">
      {session.data ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Account</h2>
          <p>{session.data.user.name}</p>
          <p className="text-ink-2">{session.data.user.email}</p>
        </section>
      ) : null}
      <TimeZoneSetting />
      <ChangePasswordForm />
      <SessionControls />
      {session.data?.user.isInstanceAdmin ? <JobStatus /> : null}
    </div>
  );
}
