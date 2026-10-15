import type { PlatformRole, Profile } from '../../generated/prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
  profile: Profile;
  sessionId: string;
}
