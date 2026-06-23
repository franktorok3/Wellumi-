const express = require('express');
const { attachAuthUser, requireAuthUser } = require('../middleware/auth');
const { validateBody, analyzeLabelRequestSchema, saveProductRequestSchema } = require('../schemas/validation');
const {
  processScanRequest,
  analyzeLabelOnly,
  listUserScans,
  listSavedProducts,
  saveProductForUser,
} = require('../services/scanWorkflow');
const { hasSupabaseConfig, hasOpenAIConfig } = require('../config');

const router = express.Router();

router.post('/analyze-label', attachAuthUser, async (req, res) => {
  try {
    const body = validateBody(analyzeLabelRequestSchema, req.body || {});

    if (req.user && hasSupabaseConfig()) {
      const result = await processScanRequest({
        userId: req.user.id,
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
        barcode: body.barcode,
      });
      return res.json(result);
    }

    if (!body.imageBase64) {
      return res.status(400).json({
        error: 'imageBase64 is required when persistence is unavailable.',
      });
    }

    const legacy = await analyzeLabelOnly({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
    });

    return res.json({
      ...legacy,
      persisted: false,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('[wellumi] POST /analyze-label failed', {
        message: error.message,
      });
    }
    return res.status(statusCode).json({
      error: error.message || 'Unexpected label analysis error.',
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
    const savedProduct = await saveProductForUser(req.user.id, body.productId);
    return res.status(201).json({ savedProduct });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error('[wellumi] POST /saved-products failed', { message: error.message });
    return res.status(statusCode).json({
      error: error.message || 'Could not save product.',
    });
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
