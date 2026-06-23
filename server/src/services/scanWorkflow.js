const { config, hasSupabaseConfig } = require('../config');
const { getSupabaseAdmin } = require('./supabase');
const { fetchProductByBarcode } = require('./openFoodFacts');
const { searchFoodDataCentral } = require('./usda');
const { analyzeLabelImage } = require('./openai');
const { uploadScanImage } = require('./storage');
const {
  normalizeFromOpenFoodFacts,
  normalizeFromUsda,
  normalizeFromOpenAi,
  mergeProductRecords,
  buildAnalysisFromLabelSummary,
  toClientScanResponse,
  toLegacyAnalyzeLabelResponse,
} = require('./productNormalizer');

async function findProductByBarcode(barcode) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !barcode) {
    return null;
  }

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
          name: productInput.name || existing.name,
          brand: productInput.brand || existing.brand,
          ingredients_text: productInput.ingredients_text || existing.ingredients_text,
          ingredients_data: {
            ...existing.ingredients_data,
            ...productInput.ingredients_data,
          },
          nutrition_data: {
            ...existing.nutrition_data,
            ...productInput.nutrition_data,
          },
          product_image_url: productInput.product_image_url || existing.product_image_url,
          source: productInput.source === existing.source ? existing.source : 'merged',
          source_product_id: productInput.source_product_id || existing.source_product_id,
          raw_source_data: {
            ...existing.raw_source_data,
            ...productInput.raw_source_data,
          },
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Could not update existing product: ${error.message}`);
      }

      return data;
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert(productInput)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not create product: ${error.message}`);
  }

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

  if (error) {
    throw new Error(`Could not create analysis: ${error.message}`);
  }

  return data;
}

async function createScan({ userId, productId, analysisId, scanType, imageUrl, extractedText }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scans')
    .insert({
      user_id: userId,
      product_id: productId,
      analysis_id: analysisId,
      scan_type: scanType,
      image_url: imageUrl,
      extracted_text: extractedText,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not create scan: ${error.message}`);
  }

  return data;
}

async function resolveExternalProduct({ barcode, labelSummary }) {
  let normalizedProduct = null;
  const labelSummaryResult = labelSummary || null;

  if (barcode) {
    const existing = await findProductByBarcode(barcode);
    if (existing) {
      return {
        productRecord: existing,
        labelSummary: labelSummaryResult,
        reusedExistingProduct: true,
      };
    }

    const offPayload = await fetchProductByBarcode(barcode);
    if (offPayload) {
      normalizedProduct = normalizeFromOpenFoodFacts(offPayload);
    }
  }

  if (!normalizedProduct && labelSummaryResult) {
    normalizedProduct = normalizeFromOpenAi(labelSummaryResult);
  }

  const shouldUseUsdaFallback =
    !normalizedProduct ||
    !normalizedProduct.nutrition_data ||
    Object.keys(normalizedProduct.nutrition_data || {}).length === 0;

  if (shouldUseUsdaFallback) {
    const usdaPayload = await searchFoodDataCentral({
      barcode,
      name: normalizedProduct?.name || labelSummaryResult?.product_name,
      brand: normalizedProduct?.brand,
    });

    if (usdaPayload) {
      const usdaProduct = normalizeFromUsda(usdaPayload);
      normalizedProduct = mergeProductRecords(normalizedProduct, usdaProduct);
    }
  }

  if (!normalizedProduct && labelSummaryResult) {
    normalizedProduct = normalizeFromOpenAi(labelSummaryResult);
  }

  if (!normalizedProduct) {
    const error = new Error('No product information could be resolved for this scan.');
    error.statusCode = 404;
    throw error;
  }

  if (barcode && !normalizedProduct.barcode) {
    normalizedProduct.barcode = barcode;
  }

  const productRecord = await upsertProduct(normalizedProduct);

  return {
    productRecord,
    labelSummary: labelSummaryResult,
    reusedExistingProduct: false,
  };
}

async function processScanRequest({ userId, imageBase64, mimeType, barcode }) {
  if (!hasSupabaseConfig()) {
    const error = new Error('Supabase is not configured on the server.');
    error.statusCode = 500;
    throw error;
  }

  if (!userId) {
    const error = new Error('Authentication required to persist scan results.');
    error.statusCode = 401;
    throw error;
  }

  let labelSummary = null;
  const scanType = imageBase64 ? 'image' : barcode ? 'barcode' : 'manual';

  if (imageBase64) {
    labelSummary = await analyzeLabelImage({ imageBase64, mimeType });
  }

  const { productRecord, labelSummary: resolvedLabelSummary, reusedExistingProduct } =
    await resolveExternalProduct({
      barcode: barcode || null,
      labelSummary,
    });

  let analysisRecord = null;
  const effectiveLabelSummary =
    resolvedLabelSummary ||
    productRecord.raw_source_data?.openai_label ||
    (imageBase64 ? labelSummary : null);

  if (effectiveLabelSummary) {
    const analysisInput = buildAnalysisFromLabelSummary(effectiveLabelSummary, {
      model: config.openai.model,
      promptVersion: config.openai.promptVersion,
    });

    analysisRecord = await createAnalysis({
      productId: productRecord.id,
      userId,
      analysisInput,
    });
  } else if (!reusedExistingProduct) {
    const analysisInput = {
      score: null,
      summary:
        'Source-backed product details were retrieved. AI label analysis was not required for this scan.',
      positives: [
        {
          title: 'Product record',
          body: `${productRecord.name}${productRecord.brand ? ` by ${productRecord.brand}` : ''}`,
        },
      ],
      concerns: [
        {
          type: 'analysis_notice',
          body: 'Retrieved product facts are informational. AI conclusions are not verified medical guidance.',
        },
      ],
      allergen_flags: [],
      confidence: null,
      model: null,
      prompt_version: null,
    };

    analysisRecord = await createAnalysis({
      productId: productRecord.id,
      userId,
      analysisInput,
    });
  }

  const imageUrl = imageBase64
    ? await uploadScanImage({ userId, imageBase64, mimeType })
    : productRecord.product_image_url;

  const scanRecord = await createScan({
    userId,
    productId: productRecord.id,
    analysisId: analysisRecord?.id || null,
    scanType,
    imageUrl,
    extractedText:
      effectiveLabelSummary?.detected_label_text ||
      productRecord.ingredients_text ||
      null,
  });

  return toClientScanResponse({
    product: productRecord,
    analysis: analysisRecord,
    scan: scanRecord,
    labelSummary: effectiveLabelSummary,
  });
}

async function analyzeLabelOnly({ imageBase64, mimeType }) {
  const labelSummary = await analyzeLabelImage({ imageBase64, mimeType });
  return toLegacyAnalyzeLabelResponse(labelSummary);
}

async function listUserScans(userId, { limit = 20 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scans')
    .select(
      `
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
        nutrition_data,
        product_image_url,
        source
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
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load scans: ${error.message}`);
  }

  return data || [];
}

async function listSavedProducts(userId, { limit = 50 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('saved_products')
    .select(
      `
      id,
      created_at,
      product:products (
        id,
        barcode,
        name,
        brand,
        ingredients_text,
        nutrition_data,
        product_image_url,
        source
      )
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load saved products: ${error.message}`);
  }

  return data || [];
}

async function saveProductForUser(userId, productId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('saved_products')
    .upsert(
      {
        user_id: userId,
        product_id: productId,
      },
      { onConflict: 'user_id,product_id' }
    )
    .select(
      `
      id,
      created_at,
      product:products (
        id,
        barcode,
        name,
        brand,
        ingredients_text,
        nutrition_data,
        product_image_url,
        source
      )
    `
    )
    .single();

  if (error) {
    throw new Error(`Could not save product: ${error.message}`);
  }

  return data;
}

module.exports = {
  processScanRequest,
  analyzeLabelOnly,
  listUserScans,
  listSavedProducts,
  saveProductForUser,
};
