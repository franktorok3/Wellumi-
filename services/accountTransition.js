import {
  completeGuestMigration,
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

export async function verifyEmailAndMigrate({
  email,
  code,
  guestUserId,
  migrationToken,
  skipMigration = false,
}) {
  const session = await verifyEmailCode(email, code);
  await refreshAuthState();
  const permanentUserId = session?.user?.id;

  if (!permanentUserId) {
    throw new Error('Email verification did not return a user session.');
  }

  if (guestUserId === permanentUserId) {
    await upgradeAccount('email');
    return {
      linked: true,
      migrated: false,
      guestUserId,
      permanentUserId,
      session,
    };
  }

  if (skipMigration) {
    return {
      linked: false,
      migrated: false,
      guestUserId,
      permanentUserId,
      session,
      guestDataPreserved: true,
    };
  }

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
    linked: false,
    migrated: true,
    guestUserId,
    permanentUserId,
    session,
    migration,
  };
}

export async function mergeGuestIntoCurrentAccount(migrationToken) {
  const permanentUserId = await getCurrentUserId();
  const migration = await completeGuestMigration(migrationToken);
  if (!migration.verification?.ok) {
    throw new Error('Guest migration verification failed.');
  }
  await upgradeAccount('email');
  if (migration.guest_user_id) {
    await clearUserCache(migration.guest_user_id);
  }
  return { permanentUserId, migration };
}
