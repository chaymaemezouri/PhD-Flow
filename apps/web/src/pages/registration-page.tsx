import { Navigate, useSearchParams } from 'react-router';

/** Registration is per submission in the paper dossier — keep route for old links. */
export function RegistrationPage() {
  const [params] = useSearchParams();
  const paperId = params.get('paper');
  if (paperId) {
    return <Navigate to={`/workspace/submissions/${paperId}`} replace />;
  }
  return <Navigate to="/workspace/submissions" replace />;
}
