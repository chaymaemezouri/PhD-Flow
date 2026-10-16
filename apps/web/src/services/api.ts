import { apiErrorSchema } from '@scholarflow/validation';
import i18n from '@/lib/i18n';

const knownErrors: Record<string, string> = {
  'Verify your email before signing in': 'errors.verifyEmail',
  'Invalid email or password': 'errors.invalidLogin',
  'An account with this email already exists': 'errors.emailTaken',
  'You are already a member of this conference': 'errors.alreadyMember',
  'Conference not found': 'errors.conferenceMissing',
  'Too many requests': 'errors.tooMany',
  'ThrottlerException: Too Many Requests': 'errors.tooMany',
  'The request failed': 'errors.failed',
  'Could not prepare a secure request': 'errors.csrf',
  'Missing or invalid CSRF token': 'errors.csrf',
  'Sign in required': 'errors.signIn',
  'MFA code required': 'errors.mfa',
  'Only a submitted paper can receive a decision': 'errors.decision',
  '20 percent is not under the threshold': 'errors.similarityHigh',
  'Upload the similarity report before verification': 'errors.similarityFile',
  'The paper is not ready to publish': 'errors.notReady',
  'Register before paying': 'errors.registerFirst',
  'Payment is not required': 'errors.noPayment',
  'The registration fee is still unpaid': 'errors.unpaid',
  'Only an accepted paper can be scheduled': 'errors.schedule',
  'Only the superadmin can create a conference': 'errors.superadminOnly',
  'Choose an admin account': 'errors.chooseAdmin',
  'The conference password is incorrect': 'errors.conferencePassword',
  'This conference has no access password': 'errors.conferencePasswordMissing',
  'Enter the conference password': 'errors.conferencePasswordRequired',
  'Only the conference admin can create a sub-admin': 'errors.subAdminOnly',
  'This account is disabled': 'errors.accountDisabled',
  'Only a draft conference can be deleted': 'errors.draftOnly',
  'Disable this account instead. It still owns papers.': 'errors.userHasPapers',
  'Remove the papers before deleting this draft': 'errors.removePapersFirst',
  'Set the conference password before publishing': 'errors.conferencePasswordRequired',
};

const base = import.meta.env.VITE_API_URL ?? '';
let csrfToken: string | null = null;

async function loadCsrf(): Promise<string> {
  const response = await fetch(`${base}/api/v1/auth/csrf`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Could not prepare a secure request');
  }
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string'
  ) {
    throw new Error('Could not prepare a secure request');
  }
  csrfToken = body.csrfToken;
  return csrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const unsafe = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (unsafe) {
    headers.set('x-csrf-token', csrfToken ?? (await loadCsrf()));
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 403 && unsafe) {
    csrfToken = null;
    headers.set('x-csrf-token', await loadCsrf());
    return fetch(`${base}${path}`, { ...init, headers, credentials: 'include' });
  }
  return response;
}

export async function apiErrorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  const message = parsed.success ? parsed.data.message : 'The request failed';
  const key = knownErrors[message];
  return key ? i18n.t(key) : message;
}

export function clearCsrf(): void {
  csrfToken = null;
}
