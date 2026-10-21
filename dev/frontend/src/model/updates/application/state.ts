export interface UpdateSnapshot {
  status: string;
  busy: boolean;
  installed: boolean;
  available: boolean;
}
export type UpdateChecks = Map<string, { version: string; checkedAt: number }>;
