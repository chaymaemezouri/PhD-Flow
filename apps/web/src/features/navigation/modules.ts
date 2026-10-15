import type { LucideIcon } from 'lucide-react';
import { CalendarRange, Gavel, Landmark, LayoutDashboard, Settings2 } from 'lucide-react';

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

export interface PlannedModule {
  id: string;
  phase: number;
  labelKey: string;
  icon: LucideIcon;
}

export const plannedModules: PlannedModule[] = [
  { id: 'decisions', phase: 6, labelKey: 'nav.decisions', icon: Gavel },
  { id: 'program', phase: 8, labelKey: 'nav.program', icon: CalendarRange },
  { id: 'administration', phase: 7, labelKey: 'nav.administration', icon: Landmark },
];

export function findPlannedModule(id: string): PlannedModule | undefined {
  return plannedModules.find((module) => module.id === id);
}

export const overviewIcon = LayoutDashboard;
export const preferencesIcon = Settings2;
