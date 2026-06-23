const express = require('express');
const { attachAuthUser, requireAuthUser } = require('../middleware/auth');
const { validateBody, analyzeLabelRequestSchema, saveProductRequestSchema } = require('../schemas/validation');
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

router.get('/feed', requireAuthUser, async (req, res) => {
  try {
    if (!hasSupabaseConfig()) {
      return res.status(503).json({ error: 'Supabase is not configured on the server.' });
    }
    const refresh = await refreshUserFeed(req.user.id);
    const items = await listUserFeed(req.user.id);
    return res.json({
      items,
      stale: refresh.stale || false,
      refreshed: refresh.refreshed || false,
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
