/**
 * Eligibility policy for the NEW V3 end-state booking reset, not the legacy
 * unverified reset_pos_bookings_v2 RPC.
 *
 * The server must independently authorize and verify its stored backup proof,
 * snapshot revision and reset generation in one transaction. This client
 * preflight never constitutes server authorization.
 */
export interface VerifiedResetPreflight {
  administratorAuthenticated: boolean;
  online: boolean;
  backupPersistedAndReadBack: boolean;
  serverSnapshotStillMatchesBackup: boolean;
  pendingLocalBookings: boolean;
  connectedDevicesReconciled: boolean;
  explicitlyConfirmed: boolean;
  /** Informational only! An open till must NOT block a verified admin reset. */
  activeTillCount: number;
}

export type VerifiedResetEligibility =
  | { allowed: true }
  | { allowed: false; reason: string };

export function verifiedAdminResetEligibility(state: VerifiedResetPreflight): VerifiedResetEligibility {
  if (!state.administratorAuthenticated) return { allowed: false, reason: 'Nur ein angemeldeter Administrator darf Buchungen zurücksetzen.' };
  if (!state.online) return { allowed: false, reason: 'Der geprüfte Gesamt-Reset benötigt eine Cloud-Verbindung.' };
  if (state.pendingLocalBookings) return { allowed: false, reason: 'Ungesendete Buchungen müssen vor der Sicherung synchronisiert werden.' };
  if (!state.connectedDevicesReconciled) return { allowed: false, reason: 'Geräte- und Offline-Buchungen müssen vor der Sicherung abgeglichen werden.' };
  if (!state.backupPersistedAndReadBack) return { allowed: false, reason: 'Vollständiges Backup muss dauerhaft gespeichert und erneut gelesen werden.' };
  if (!state.serverSnapshotStillMatchesBackup) return { allowed: false, reason: 'Nach der Sicherung haben sich Buchungen verändert. Bitte erneut sichern.' };
  if (!state.explicitlyConfirmed) return { allowed: false, reason: 'Der Administrator muss den Gesamt-Reset ausdrücklich bestätigen.' };
  // No activeTillCount check: after a verified archive the administrator may
  // reset even an open till. The server will invalidate all old sessions.
  return { allowed: true };
}
