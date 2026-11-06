/**
 * The account every Remidy has from its first start. It's only a sign-in name: `.local` addresses
 * can't receive mail from the internet, so nothing is ever sent to it.
 */
export const ADMIN_EMAIL = 'admin@remidy.local';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordRequirement {
  id: string;
  label: string;
  isMet: (password: string) => boolean;
  /** For limits almost nobody reaches, which would only clutter the list. */
  onlyShownWhenUnmet?: boolean;
}

const COMMON = /password|passw0rd|qwerty|letmein|123456|abcdef|remidy|admin/i;
const REPEATED = /^(.{1,6})\1+$/su;

/** The server enforces these and the password field shows them, so they can't disagree. */
export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    id: 'min-length',
    label: `At least ${String(MIN_PASSWORD_LENGTH)} characters`,
    isMet: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: 'max-length',
    label: `No more than ${String(MAX_PASSWORD_LENGTH)} characters`,
    isMet: (password) => password.length <= MAX_PASSWORD_LENGTH,
    onlyShownWhenUnmet: true,
  },
  {
    id: 'letter',
    label: 'A letter',
    isMet: (password) => /\p{L}/u.test(password),
  },
  {
    id: 'number-or-symbol',
    label: 'A number or symbol (a space counts)',
    isMet: (password) => /[^\p{L}]/u.test(password),
  },
  {
    id: 'not-guessable',
    label: 'No common words or repeated patterns',
    isMet: (password) => password !== '' && !COMMON.test(password) && !REPEATED.test(password),
  },
];

export function unmetPasswordRequirements(password: string): PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.isMet(password));
}
