export type ResetSafetyCheck = {
  id: 'connection' | 'sync' | 'pending' | 'ledger' | 'closed';
  label: string;
  ok: boolean;
  detail: string;
};
export type ResetSafetyResult = {
  checks: ResetSafetyCheck[];
  completed: number;
  total: number;
  percent: number;
  backupAllowed: boolean;
    resetAllowed: boolean;
  /** SHA-256 of generation, booked transactions, cash sessions, stornos. */
  backupSignature?: string;
};

export type ResetSafetyTask = {
  id: ResetSafetyCheck['id'];
  label: string;
  run: () => Promise<string>;
};

/** Each green tick reflects a finished check, not merely a configured rule.
 * The 100% progress figure means that all checks have RUN, not that all passed.
 * Remote devices that have not synced cannot be proven clean here.
 */
export async function runResetSafetyChecks(
  tasks: readonly ResetSafetyTask[],
  onProgress: (result: ResetSafetyResult) => void,
): Promise<ResetSafetyResult> {
  const checks: ResetSafetyCheck[] = [];
  const snapshot = (): ResetSafetyResult => ({
    checks: [...checks],
    completed: checks.length,
    total: tasks.length,
    percent: tasks.length ? Math.round(checks.length * 100 / tasks.length) : 100,
    backupAllowed: checks.length === tasks.length &&
      checks.filter(row => row.id !== 'closed').every(row => row.ok),
    resetAllowed: checks.length === tasks.length && checks.every(row => row.ok),
  });
  onProgress(snapshot());
  for (const task of tasks) {
    try {
      const detail = await task.run();
      checks.push({ id: task.id, label: task.label, ok: true, detail });
    } catch (error) {
      checks.push({
        id: task.id, label: task.label, ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress(snapshot());
  }
  return snapshot();
}
