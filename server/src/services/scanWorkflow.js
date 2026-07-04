const { config, hasSupabaseConfig } = require('../config');
const { getSupabaseAdmin } = require('./supabase');
const { fetchProductByBarcode } = require('./openFoodFacts');
const { searchFoodDataCentral } = require('./usda');
const { analyzeLabelImage } = require('./openai');
const { uploadScanImage, attachSignedImageUrls } = require('./storage');
const { verifySaveProductOwnership } = require('../utils/saveProductOwnership');
const {
  normalizeFromOpenFoodFacts,
  normalizeFromUsda,
  normalizeFromOpenAi,
  mergeProductRecords,
  buildAnalysisFromLabelSummary,
  buildBarcodeOnlyAnalysis,
  toClientScanResponse,
} = require('./productNormalizer');
const { recordScanSignals, recordSaveSignals } = require('./interestSignalService');

async function findProductByBarcode(barcode) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !barcode) return null;

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up product by barcode: ${error.message}`);
  }

  return data;
}

async function upsertProduct(productInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase is not configured on the server.');
  }

  if (productInput.barcode) {
    const existing = await findProductByBarcode(productInput.barcode);
    if (existing) {
      const { data, error } = await supabase
        .from('products')
        .update({
          name: productInput.name && productInput.name !== 'Unknown product' ? productInput.name : existing.name,
          brand: productInput.brand || existing.brand,
          ingredients_text: productInput.ingredients_text || existing.ingredients_text,
          ingredients_data: { ...existing.ingredients_data, ...productInput.ingredients_data },
          nutrition_data: { ...existing.nutrition_data, ...productInput.nutrition_data },
          product_image_url: productInput.product_image_url || existing.product_image_url,
          source: productInput.source === existing.source ? existing.source : 'merged',
          source_product_id: productInput.source_product_id || existing.source_product_id,
          raw_source_data: { ...existing.raw_source_data, ...productInput.raw_source_data },
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw new Error(`Could not update existing product: ${error.message}`);
      return data;
    }
  }

  const { data, error } = await supabase.from('products').insert(productInput).select('*').single();
  if (error) throw new Error(`Could not create product: ${error.message}`);
  return data;
}

async function createAnalysis({ productId, userId, analysisInput }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      product_id: productId,
      user_id: userId,
      score: analysisInput.score,
      summary: analysisInput.summary,
      positives: analysisInput.positives,
      concerns: analysisInput.concerns,
      allergen_flags: analysisInput.allergen_flags,
      confidence: analysisInput.confidence,
      model: analysisInput.model,
      prompt_version: analysisInput.prompt_version,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Could not create analysis: ${error.message}`);
  return data;
}

async function createScan({ userId, productId, analysisId, scanType, imagePath, extractedText }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scans')
    .insert({
      user_id: userId,
      product_id: productId,
      analysis_id: analysisId,
      scan_type: scanType,
      image_url: imagePath,
      extracted_text: extractedText,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Could not create scan: ${error.message}`);
  return data;
}

async function resolveExternalProduct({ barcode, labelSummary, imageBase64 }) {
  let normalizedProduct = null;
  const labelSummaryResult = labelSummary || null;
  let offFound = false;

  if (barcode) {
    const offPayload = await fetchProductByBarcode(barcode);
    if (offPayload) {
      offFound = true;
      normalizedProduct = normalizeFromOpenFoodFacts(offPayload);
    }
  }

  if (!normalizedProduct && labelSummaryResult) {
    normalizedProduct = normalizeFromOpenAi(labelSummaryResult);
  }

  const nutritionMissing =
    !normalizedProduct?.nutrition_data || Object.keys(normalizedProduct.nutrition_data).length <= 1;

  if (nutritionMissing && (normalizedProduct || labelSummaryResult || barcode)) {
    const usdaPayload = await searchFoodDataCentral({
      barcode,
      name: normalizedProduct?.name || labelSummaryResult?.product_name,
      brand: normalizedProduct?.brand,
    });
    if (usdaPayload) {
      normalizedProduct = mergeProductRecords(normalizedProduct, normalizeFromUsda(usdaPayload));
    }
  }

  if (!normalizedProduct && labelSummaryResult) {
    normalizedProduct = normalizeFromOpenAi(labelSummaryResult);
  }

  if (!normalizedProduct) {
    if (barcode && !imageBase64 && !offFound) {
      const error = new Error(
        'This barcode was not found in Open Food Facts. Photograph the label to continue.'
      );
      error.statusCode = 404;
      error.code = 'BARCODE_NOT_FOUND';
      throw error;
    }

    const error = new Error('No product information could be resolved for this scan.');
    error.statusCode = 404;
    error.code = 'PRODUCT_NOT_FOUND';
    throw error;
  }

  if (barcode && !normalizedProduct.barcode) {
    normalizedProduct.barcode = barcode;
  }

  const productRecord = await upsertProduct(normalizedProduct);
  return { productRecord, labelSummary: labelSummaryResult, offFound };
}

async function processScanRequest({ userId, imageBase64, mimeType, barcode }) {
  if (!hasSupabaseConfig()) {
    const error = new Error('Supabase is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  if (!userId) {
    const error = new Error('Authentication required to persist scan results.');
    error.statusCode = 401;
    throw error;
  }

  let labelSummary = null;
  const scanType = imageBase64 && barcode ? 'image' : imageBase64 ? 'image' : 'barcode';

  if (imageBase64) {
    labelSummary = await analyzeLabelImage({ imageBase64, mimeType });
  }

  const { productRecord, labelSummary: resolvedLabelSummary } = await resolveExternalProduct({
    barcode: barcode || null,
    labelSummary,
    imageBase64,
  });

  const effectiveLabelSummary = resolvedLabelSummary || labelSummary;

  let analysisRecord;
  if (effectiveLabelSummary) {
    analysisRecord = await createAnalysis({
      productId: productRecord.id,
      userId,
      analysisInput: buildAnalysisFromLabelSummary(effectiveLabelSummary, {
        model: config.openai.model,
        promptVersion: config.openai.promptVersion,
      }),
    });
  } else {
    analysisRecord = await createAnalysis({
      productId: productRecord.id,
      userId,
      analysisInput: buildBarcodeOnlyAnalysis(productRecord),
    });
  }

  const imagePath = imageBase64
    ? await uploadScanImage({ userId, imageBase64, mimeType })
    : null;

  const scanRecord = await createScan({
    userId,
    productId: productRecord.id,
    analysisId: analysisRecord.id,
    scanType,
    imagePath,
    extractedText:
      effectiveLabelSummary?.detected_label_text || productRecord.ingredients_text || null,
  });

  try {
    await recordScanSignals(userId, scanRecord.id, productRecord, analysisRecord);
  } catch (signalError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[wellumi-scan] recordScanSignals failed', signalError.message);
    }
  }

  const [scanWithSignedUrl] = await attachSignedImageUrls([scanRecord]);
  return toClientScanResponse({
    product: productRecord,
    analysis: analysisRecord,
    scan: scanWithSignedUrl,
    labelSummary: effectiveLabelSummary,
  });
}

const SCAN_SELECT = `
  id,
  scan_type,
  image_url,
  extracted_text,
  created_at,
  product:products (
    id,
    barcode,
    name,
    brand,
    ingredients_text,
    ingredients_data,
    nutrition_data,
    product_image_url,
    source,
    raw_source_data
  ),
  analysis:analyses (
    id,
    summary,
    positives,
    concerns,
    allergen_flags,
    confidence,
    model,
    prompt_version,
    created_at
  )
`;

async function listUserScans(userId, { limit = 20 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scans')
    .select(SCAN_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load scans: ${error.message}`);
  return attachSignedImageUrls(data || []);
}

async function listSavedProducts(userId, { limit = 50 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('saved_products')
    .select(
      `
      id,
      created_at,
      analysis_id,
      scan_id,
      product:products (
        id,
        barcode,
        name,
        brand,
        ingredients_text,
        ingredients_data,
        nutrition_data,
        product_image_url,
        source,
        raw_source_data
      ),
      analysis:analyses (
        id,
        summary,
        positives,
        concerns,
        allergen_flags,
        confidence,
        model,
        prompt_version,
        created_at
      ),
      scan:scans (
        id,
        scan_type,
        image_url,
        extracted_text,
        created_at
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load saved products: ${error.message}`);

  const enriched = await Promise.all(
    (data || []).map(async (item) => {
      const scan = item.scan ? (await attachSignedImageUrls([item.scan]))[0] : null;
      return { ...item, scan };
    })
  );

  return enriched;
}

async function saveProductForUser(userId, { productId, analysisId, scanId }) {
  const supabase = getSupabaseAdmin();

  await verifySaveProductOwnership(supabase, userId, { productId, analysisId, scanId });

  let existingQuery = supabase
    .from('saved_products')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId);

  if (analysisId) {
    existingQuery = existingQuery.eq('analysis_id', analysisId);
  } else {
    existingQuery = existingQuery.is('analysis_id', null);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabase.from('saved_products').insert({
      user_id: userId,
      product_id: productId,
      analysis_id: analysisId || null,
      scan_id: scanId || null,
    });
    if (insertError) throw new Error(`Could not save product: ${insertError.message}`);
  } else if (scanId) {
    await supabase
      .from('saved_products')
      .update({ scan_id: scanId })
      .eq('id', existing.id);
  }

  const { data, error } = await supabase
    .from('saved_products')
    .select(
      `
      id,
      created_at,
      analysis_id,
      scan_id,
      product:products (*),
      analysis:analyses (*),
      scan:scans (*)
    `
    )
    .eq('user_id', userId)
    .eq('product_id', productId);

  const row = analysisId
    ? data?.find((item) => item.analysis_id === analysisId)
    : data?.find((item) => !item.analysis_id);

  if (error || !row) {
    throw new Error(`Could not load saved product: ${error?.message || 'Not found'}`);
  }

  try {
    await recordSaveSignals(userId, productId, row.product, row.analysis);
  } catch (signalError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[wellumi-save] recordSaveSignals failed', signalError.message);
    }
  }

  const scan = row.scan ? (await attachSignedImageUrls([row.scan]))[0] : null;
  return { ...row, scan };
}

module.exports = {
  processScanRequest,
  listUserScans,
  listSavedProducts,
  saveProductForUser,
};
