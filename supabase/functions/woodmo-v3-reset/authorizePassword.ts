import { verifyExistingStaffPassword } from './passwordProof.ts';

export interface AdministratorRecord {
  role?: unknown;
  active?: unknown;
  passwordSalt?: string | null;
  passwordHash?: string | null;
}

/** Only call with password proof and administrator rows loaded by the server. */
export async function authorizedResetPassword(
  input: string,
  cloudManagerValid: boolean,
  cloudStaff: readonly AdministratorRecord[],
): Promise<boolean> {
  if (!input || input.length > 256) return false;
  if (cloudManagerValid) return true;
  for (const staff of cloudStaff) {
    if (staff.role !== 'administrator' || staff.active !== true) continue;
    if (await verifyExistingStaffPassword(input, staff.passwordSalt ?? null, staff.passwordHash ?? null)) {
      return true;
    }
  }
  return false;
}
