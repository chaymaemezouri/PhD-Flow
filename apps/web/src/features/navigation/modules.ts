import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Settings2 } from 'lucide-react';

export const workspaceRoles = [
  'author',
  'reviewer',
  'committee',
  'administrator',
  'system',
] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return workspaceRoles.some((role) => role === value);
}

export const overviewIcon: LucideIcon = LayoutDashboard;
export const preferencesIcon: LucideIcon = Settings2;
