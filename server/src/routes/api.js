const express = require('express');
const { attachAuthUser, requireAuthUser } = require('../middleware/auth');
const {
  validateBody,
  analyzeLabelRequestSchema,
  saveProductRequestSchema,
  preferencesSchema,
  onboardingStepSchema,
  patchMeSchema,
  storyFeedbackSchema,
  accountUpgradeSchema,
  completeMigrationSchema,
  migrationPreviewSchema,
  deleteAccountSchema,
} = require('../schemas/validation');
const {
  processScanRequest,
  listUserScans,
  listSavedProducts,
  saveProductForUser,
} = require('../services/scanWorkflow');
const {
  refreshUserFeed,
  listUserFeed,
  markFeedRead,
  dismissFeedItem,
} = require('../services/feedWorkflow');
const {
  getMe,
  patchMe,
  getPreferences,
  putPreferences,
  startOnboarding,
  saveOnboardingStep,
  completeOnboarding,
} = require('../services/profileWorkflow');
const {
  buildNormalizedInterestProfile,
  recordStoryFeedback,
  deactivateInferredTopic,
} = require('../services/interestSignalService');
const { deleteAccount, markAccountUpgraded, syncProfileAccountType } = require('../services/accountWorkflow');
const {
  createMigrationToken,
  completeGuestMigration,
} = require('../services/guestMigrationService');
const { previewGuestMigration } = require('../services/guestMigrationPreview');
const { hasSupabaseConfig, hasOpenAIConfig } = require('../config');

const router = express.Router();

router.post('/analyze-label', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }

    const body = validateBody(analyzeLabelRequestSchema, req.body || {});
    const result = await processScanRequest({
      userId: req.user.id,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      barcode: body.barcode,
    });
    return res.json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('[wellumi] POST /analyze-label failed', {
        message: error.message,
        code: error.code,
      });
    }
    return res.status(statusCode).json({
      error: error.message || 'Unexpected label analysis error.',
      code: error.code || null,
    });
  }
});

router.get('/scans', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const scans = await listUserScans(req.user.id);
    return res.json({ scans });
  } catch (error) {
    console.error('[wellumi] GET /scans failed', { message: error.message });
    return res.status(500).json({ error: error.message || 'Could not load scans.' });
  }
});

router.get('/saved-products', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const savedProducts = await listSavedProducts(req.user.id);
    return res.json({ savedProducts });
  } catch (error) {
    console.error('[wellumi] GET /saved-products failed', { message: error.message });
    return res.status(500).json({ error: error.message || 'Could not load saved products.' });
  }
});

router.post('/saved-products', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const body = validateBody(saveProductRequestSchema, req.body || {});
    const savedProduct = await saveProductForUser(req.user.id, body);
    return res.status(201).json({ savedProduct });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error('[wellumi] POST /saved-products failed', { message: error.message });
    return res.status(statusCode).json({ error: error.message || 'Could not save product.' });
  }
});

router.get('/me', requireAuthUser, async (req, res) => {
  try {
    await syncProfileAccountType(req.user.id, req.user);
    const me = await getMe(req.user.id);
    return res.json(me);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load profile.' });
  }
});

router.patch('/me', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(patchMeSchema, req.body || {});
    const profile = await patchMe(req.user.id, body);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not update profile.' });
  }
});

router.get('/preferences', requireAuthUser, async (req, res) => {
  try {
    const preferences = await getPreferences(req.user.id);
    return res.json({ preferences });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load preferences.' });
  }
});

router.put('/preferences', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(preferencesSchema, req.body || {});
    const preferences = await putPreferences(req.user.id, body);
    await refreshUserFeed(req.user.id, { force: true });
    return res.json({ preferences });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not save preferences.' });
  }
});

router.post('/onboarding/start', requireAuthUser, async (req, res) => {
  try {
    const profile = await startOnboarding(req.user.id);
    return res.json({ profile });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not start onboarding.' });
  }
});

router.patch('/onboarding/step', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(onboardingStepSchema, req.body || {});
    const profile = await saveOnboardingStep(req.user.id, body);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not save onboarding step.' });
  }
});

router.post('/onboarding/complete', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(preferencesSchema, req.body || {});
    const result = await completeOnboarding(req.user.id, body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not complete onboarding.' });
  }
});

router.get('/interest-profile', requireAuthUser, async (req, res) => {
  try {
    const [scans, savedProducts] = await Promise.all([
      listUserScans(req.user.id, { limit: 20 }),
      listSavedProducts(req.user.id, { limit: 20 }),
    ]);
    const interestProfile = await buildNormalizedInterestProfile(req.user.id, { scans, savedProducts });
    return res.json({ interestProfile });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load interest profile.' });
  }
});

router.delete('/interest-profile/:topic', requireAuthUser, async (req, res) => {
  try {
    await deactivateInferredTopic(req.user.id, req.params.topic);
    await refreshUserFeed(req.user.id, { force: true });
    return res.json({ removed: req.params.topic });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not remove inferred topic.' });
  }
});

router.post('/stories/:storyId/feedback', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(storyFeedbackSchema, req.body || {});
    const feedback = await recordStoryFeedback(req.user.id, req.params.storyId, body.feedback_type, body.metadata);
    if (['not_relevant', 'less_like_this', 'dismissed'].includes(body.feedback_type)) {
      await refreshUserFeed(req.user.id, { force: true });
    }
    return res.json({ feedback });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not record feedback.' });
  }
});

router.post('/account/migration-token', requireAuthUser, async (req, res) => {
  try {
    const token = await createMigrationToken(req.user.id);
    return res.json(token);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || 'Could not create migration token.' });
  }
});

router.post('/account/migration-preview', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(migrationPreviewSchema, req.body || {});
    const preview = await previewGuestMigration(req.user.id, body.migration_token);
    return res.json({ preview });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || 'Could not preview guest migration.' });
  }
});

router.post('/account/complete-migration', requireAuthUser, async (req, res) => {
  try {
    const body = validateBody(completeMigrationSchema, req.body || {});
    const result = await completeGuestMigration(req.user.id, body.migration_token);
    if (!result.verification?.ok) {
      return res.status(500).json({
        error: 'Migration verification failed.',
        verification: result.verification,
        result,
      });
    }
    const profile = await markAccountUpgraded(req.user.id, req.user);
    return res.json({ ...result, profile });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || 'Could not complete guest migration.' });
  }
});

router.post('/account/upgrade', requireAuthUser, async (req, res) => {
  try {
    validateBody(accountUpgradeSchema, req.body || {});
    const profile = await markAccountUpgraded(req.user.id, req.user);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not upgrade account.' });
  }
});

router.post('/account/sign-out', requireAuthUser, async (req, res) => {
  return res.json({ ok: true, message: 'Sign out handled on client.' });
});

router.delete('/account', requireAuthUser, async (req, res) => {
  try {
    validateBody(deleteAccountSchema, req.body || {});
    const result = await deleteAccount(req.user.id, { confirm: true });
    return res.json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || 'Could not delete account.' });
  }
});

router.get('/feed', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const refresh = await refreshUserFeed(req.user.id);
    const items = refresh.items || (await listUserFeed(req.user.id));
    return res.json({
      items,
      stale: refresh.stale || false,
      refreshed: refresh.refreshed || false,
      liveProvidersSucceeded: refresh.liveProvidersSucceeded || 0,
      liveProvidersFailed: refresh.liveProvidersFailed || 0,
      evergreenFallbackUsed: Boolean(refresh.evergreenFallbackUsed),
      createdStoryCount: refresh.createdStoryCount || 0,
      reusedStoryCount: refresh.reusedStoryCount || 0,
      deactivatedMatchCount: refresh.deactivatedMatchCount || 0,
    });
  } catch (error) {
    console.error('[wellumi] GET /feed failed', { message: error.message });
    return res.status(500).json({ error: error.message || 'Could not load feed.' });
  }
});

router.post('/feed/refresh', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const refresh = await refreshUserFeed(req.user.id, { force: true });
    const items = await listUserFeed(req.user.id);
    return res.json({
      items,
      stale: refresh.stale || false,
      refreshed: refresh.refreshed || false,
      errors: refresh.errors || [],
      liveProvidersSucceeded: refresh.liveProvidersSucceeded || 0,
      liveProvidersFailed: refresh.liveProvidersFailed || 0,
      evergreenFallbackUsed: Boolean(refresh.evergreenFallbackUsed),
      createdStoryCount: refresh.createdStoryCount || 0,
      reusedStoryCount: refresh.reusedStoryCount || 0,
      deactivatedMatchCount: refresh.deactivatedMatchCount || 0,
    });
  } catch (error) {
    console.error('[wellumi] POST /feed/refresh failed', { message: error.message });
    return res.status(500).json({ error: error.message || 'Could not refresh feed.' });
  }
});

router.patch('/feed/:id/read', requireAuthUser, async (req, res) => {
  try {
    const item = await markFeedRead(req.user.id, req.params.id);
    return res.json({ item });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not update feed item.' });
  }
});

router.patch('/feed/:id/dismiss', requireAuthUser, async (req, res) => {
  try {
    const item = await dismissFeedItem(req.user.id, req.params.id);
    if (item?.story_id) {
      await recordStoryFeedback(req.user.id, item.story_id, 'dismissed', {
        user_story_match_id: item.id,
      });
    }
    return res.json({ item });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not dismiss feed item.' });
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'wellumi-api',
    time: new Date().toISOString(),
    hasOpenAIKey: hasOpenAIConfig(),
    hasSupabaseConfig: hasSupabaseConfig(),
  });
});

module.exports = router;
