import {
  completeGuestMigration,
  fetchMigrationPreview,
  requestMigrationToken,
  upgradeAccount,
} from './api';
import {
  getCurrentUserId,
  refreshAuthState,
  sendEmailCode,
  verifyEmailCode,
} from './auth';
import { clearUserCache } from './userCache';

export async function prepareGuestMigrationHandshake() {
  const guestUserId = await getCurrentUserId();
  const tokenPayload = await requestMigrationToken();
  return {
    guestUserId,
    migrationToken: tokenPayload.migration_token,
    expiresAt: tokenPayload.expires_at,
  };
}

export async function sendEmailUpgradeCode(email) {
  const handshake = await prepareGuestMigrationHandshake();
  await sendEmailCode(email);
  return handshake;
}

export async function verifyEmailOnly({ email, code }) {
  const guestUserId = await getCurrentUserId();
  const session = await verifyEmailCode(email, code);
  await refreshAuthState();
  const permanentUserId = session?.user?.id;

  if (!permanentUserId) {
    throw new Error('Email verification did not return a user session.');
  }

  const linked = guestUserId === permanentUserId;
  if (linked) {
    await upgradeAccount('email');
  }

  return {
    guestUserId,
    permanentUserId,
    session,
    linked,
    needsMerge: !linked,
  };
}

export async function loadMigrationPreview(migrationToken) {
  const payload = await fetchMigrationPreview(migrationToken);
  return payload.preview;
}

export async function skipGuestMerge(guestUserId) {
  if (guestUserId) {
    await clearUserCache(guestUserId);
  }
  return {
    migrated: false,
    guestDataPreserved: true,
    guestUserId,
  };
}

export async function executeGuestMerge({ migrationToken, guestUserId }) {
  if (!migrationToken) {
    throw new Error('A migration token is required to move guest activity to this account.');
  }

  const migration = await completeGuestMigration(migrationToken);
  if (!migration.verification?.ok) {
    throw new Error('Guest migration verification failed. Your guest data was not moved.');
  }

  await upgradeAccount('email');
  if (guestUserId) {
    await clearUserCache(guestUserId);
  }

  return {
    migrated: true,
    guestUserId: migration.guest_user_id || guestUserId,
    permanentUserId: migration.destination_user_id,
    migration,
  };
}

/** @deprecated Use verifyEmailOnly + executeGuestMerge after explicit approval */
export async function verifyEmailAndMigrate({
  email,
  code,
  guestUserId,
  migrationToken,
  skipMigration = false,
}) {
  const verified = await verifyEmailOnly({ email, code });
  if (verified.linked || skipMigration) {
    if (skipMigration && verified.needsMerge) {
      await skipGuestMerge(verified.guestUserId);
    }
    return {
      ...verified,
      migrated: false,
      guestDataPreserved: skipMigration && verified.needsMerge,
    };
  }
  return executeGuestMerge({
    migrationToken,
    guestUserId: guestUserId || verified.guestUserId,
  });
}

export async function mergeGuestIntoCurrentAccount(migrationToken, guestUserId) {
  return executeGuestMerge({ migrationToken, guestUserId });
}
