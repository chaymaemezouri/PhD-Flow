import { Navigate, createBrowserRouter } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RequireAuth } from '@/features/auth/require-auth';
import { useCurrentUser } from '@/features/auth/use-account';
import { AppShell } from '@/layouts/app-shell';
import { AccountPage } from '@/pages/account-page';
import { ConferenceAccessPage } from '@/pages/conference-access-page';
import { ConferenceManagePage } from '@/pages/conference-manage-page';
import { ConferencesPage } from '@/pages/conferences-page';
import { DirectoryPage } from '@/pages/directory-page';
import { InvitationPage } from '@/pages/invitation-page';
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { PreferencesPage } from '@/pages/preferences-page';
import { RegisterPage } from '@/pages/register-page';
import { ResetPasswordPage } from '@/pages/reset-password-page';
import { FollowUpPage } from '@/pages/follow-up-page';
import { ProgramPage } from '@/pages/program-page';
import { RegistrationPage } from '@/pages/registration-page';
import { ReviewDetailPage } from '@/pages/review-detail-page';
import { ReviewsPage } from '@/pages/reviews-page';
import { RoleDashboardPage, WorkspaceHome } from '@/pages/role-dashboard-page';
import { AssignmentBoardPage } from '@/pages/assignment-board-page';
import { ReviewersPage } from '@/pages/reviewers-page';
import { SessionBoardPage } from '@/pages/session-board-page';
import { SessionChairPage } from '@/pages/session-chair-page';
import { SessionChairTalkPage } from '@/pages/session-chair-talk-page';
import { SuperadminPage } from '@/pages/superadmin-page';
import { SubmissionEditorPage } from '@/pages/submission-editor-page';
import { SubmissionsPage } from '@/pages/submissions-page';
import { VerifyEmailPage } from '@/pages/verify-email-page';

function HomeEntry() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  if (account.isPending) {
    return <p className="p-8 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (account.data) {
    return <Navigate to="/workspace" replace />;
  }
  return <Navigate to="/login" replace />;
}

export const routes = [
  { path: '/', element: <HomeEntry /> },
  { path: '/directory', element: <DirectoryPage /> },
  { path: '/directory/:slug', element: <DirectoryPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/invitations/accept', element: <InvitationPage /> },
      {
        path: '/workspace',
        element: <AppShell />,
        children: [
          { index: true, element: <WorkspaceHome /> },
          { path: 'author', element: <RoleDashboardPage role="author" /> },
          { path: 'reviewer', element: <RoleDashboardPage role="reviewer" /> },
          { path: 'committee', element: <RoleDashboardPage role="committee" /> },
          { path: 'administrator', element: <RoleDashboardPage role="administrator" /> },
          { path: 'system/*', element: <SuperadminPage /> },
          { path: 'conference-access', element: <ConferenceAccessPage /> },
          { path: 'preferences', element: <PreferencesPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'conferences', element: <ConferencesPage /> },
          { path: 'conferences/:conferenceId', element: <ConferenceManagePage /> },
          { path: 'submissions', element: <SubmissionsPage /> },
          { path: 'submissions/new', element: <SubmissionEditorPage /> },
          { path: 'submissions/:paperId', element: <SubmissionEditorPage /> },
          { path: 'reviews', element: <ReviewsPage /> },
          { path: 'reviews/:assignmentId', element: <ReviewDetailPage /> },
          { path: 'assignments', element: <AssignmentBoardPage /> },
          { path: 'registration', element: <RegistrationPage /> },
          { path: 'follow-up', element: <FollowUpPage /> },
          { path: 'program', element: <ProgramPage /> },
          { path: 'session-board', element: <SessionBoardPage /> },
          { path: 'session-chair', element: <SessionChairPage /> },
          { path: 'session-chair/:paperId', element: <SessionChairTalkPage /> },
          { path: 'reviewers', element: <ReviewersPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
