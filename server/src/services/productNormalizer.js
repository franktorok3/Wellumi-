function pickImageUrl(offProduct) {
  return (
    offProduct?.image_front_url ||
    offProduct?.image_url ||
    offProduct?.image_front_small_url ||
    null
  );
}

function normalizeNutrientsFromOff(nutriments = {}) {
  const entries = Object.entries(nutriments).filter(([key, value]) => {
    return typeof value === 'number' && !key.endsWith('_unit') && !key.endsWith('_serving');
  });

  return {
    source: 'open_food_facts',
    per_100g: Object.fromEntries(entries.slice(0, 40)),
  };
}

function normalizeNutrientsFromUsda(foodNutrients = []) {
  const nutrients = foodNutrients
    .filter((item) => item?.nutrientName && typeof item?.value === 'number')
    .slice(0, 40)
    .map((item) => ({
      name: item.nutrientName,
      amount: item.value,
      unit: item.unitName || null,
    }));

  return {
    source: 'usda_fdc',
    nutrients,
  };
}

function normalizeFromOpenFoodFacts(offPayload) {
  const product = offPayload.product;
  return {
    barcode: offPayload.sourceProductId,
    name: product.product_name?.trim() || 'Unknown product',
    brand: product.brands?.split(',')[0]?.trim() || null,
    ingredients_text: product.ingredients_text?.trim() || null,
    ingredients_data: {
      tags: product.ingredients_tags || [],
      parsed: product.ingredients || [],
    },
    nutrition_data: normalizeNutrientsFromOff(product.nutriments || {}),
    product_image_url: pickImageUrl(product),
    source: 'open_food_facts',
    source_product_id: offPayload.sourceProductId,
    raw_source_data: {
      open_food_facts: offPayload.raw,
    },
  };
}

function normalizeFromUsda(usdaPayload) {
  const product = usdaPayload.product;
  return {
    barcode: null,
    name: product.description?.trim() || 'Unknown product',
    brand: product.brandOwner?.trim() || null,
    ingredients_text: product.ingredients?.trim() || null,
    ingredients_data: {
      parsed: product.ingredients ? [product.ingredients] : [],
    },
    nutrition_data: normalizeNutrientsFromUsda(product.foodNutrients || []),
    product_image_url: null,
    source: 'usda_fdc',
    source_product_id: usdaPayload.sourceProductId,
    raw_source_data: {
      usda_fdc: usdaPayload.raw,
    },
  };
}

function normalizeFromOpenAi(labelSummary) {
  return {
    barcode: null,
    name: labelSummary.product_name?.trim() || 'Unknown product',
    brand: null,
    ingredients_text: labelSummary.detected_label_text?.trim() || null,
    ingredients_data: {
      extracted_text: labelSummary.detected_label_text || '',
    },
    nutrition_data: {},
    product_image_url: null,
    source: 'openai_label',
    source_product_id: null,
    raw_source_data: {
      openai_label: labelSummary,
    },
  };
}

function mergeProductRecords(base, enrichment) {
  if (!base) return enrichment;
  if (!enrichment) return base;

  const mergedNutrition = { ...base.nutrition_data };
  if (enrichment.nutrition_data && Object.keys(enrichment.nutrition_data).length) {
    mergedNutrition.fallback = enrichment.nutrition_data;
    mergedNutrition.sources = [
      ...(base.nutrition_data?.sources || [base.source].filter(Boolean)),
      enrichment.source,
    ];
  }

  return {
    barcode: base.barcode || enrichment.barcode || null,
    name: base.name && base.name !== 'Unknown product' ? base.name : enrichment.name,
    brand: base.brand || enrichment.brand || null,
    ingredients_text: base.ingredients_text || enrichment.ingredients_text || null,
    ingredients_data: {
      ...enrichment.ingredients_data,
      ...base.ingredients_data,
    },
    nutrition_data: mergedNutrition,
    product_image_url: base.product_image_url || enrichment.product_image_url || null,
    source: base.source === enrichment.source ? base.source : 'merged',
    source_product_id: base.source_product_id || enrichment.source_product_id || null,
    raw_source_data: {
      ...enrichment.raw_source_data,
      ...base.raw_source_data,
    },
  };
}

function buildSourceAttribution(product, labelSummary) {
  const sources = [];

  if (product?.raw_source_data?.open_food_facts) {
    sources.push({
      name: 'Open Food Facts',
      type: 'product_facts',
      label: 'Product facts from Open Food Facts',
    });
  }

  if (product?.raw_source_data?.usda_fdc) {
    sources.push({
      name: 'USDA FoodData Central',
      type: 'nutrition_facts',
      label: 'Nutrition context from USDA FoodData Central',
    });
  }

  if (labelSummary || product?.raw_source_data?.openai_label) {
    sources.push({
      name: 'OpenAI label analysis',
      type: 'ai_context',
      label: 'AI-generated informational context (not verified product data)',
    });
  }

  return sources;
}

function buildAnalysisFromLabelSummary(labelSummary, { model, promptVersion }) {
  const sections = [
    { title: 'What it is', body: labelSummary.what_it_is, kind: 'ai_context' },
    {
      title: 'What people commonly use it for',
      body: labelSummary.what_people_commonly_use_it_for,
      kind: 'ai_context',
    },
    { title: 'What sources say', body: labelSummary.what_sources_say, kind: 'ai_context' },
    {
      title: 'Questions to ask a professional',
      body: labelSummary.questions_to_ask_a_professional.join('\n'),
      kind: 'ai_context',
    },
  ];

  return {
    score: null,
    summary: labelSummary.neutral_disclaimer,
    positives: sections,
    concerns: [
      {
        type: 'analysis_notice',
        body: 'AI-generated label context. Verify against the physical label and qualified professionals.',
      },
    ],
    allergen_flags: [],
    confidence: null,
    model,
    prompt_version: promptVersion,
    label_summary: labelSummary,
  };
}

function buildBarcodeOnlyAnalysis(product) {
  return {
    score: null,
    summary:
      'Source-backed product details were retrieved from external databases. AI label analysis was not required for this scan.',
    positives: [
      {
        title: 'Product record',
        body: `${product.name}${product.brand ? ` by ${product.brand}` : ''}`,
        kind: 'product_facts',
      },
    ],
    concerns: [
      {
        type: 'analysis_notice',
        body: 'External product facts are informational only and may be incomplete.',
      },
    ],
    allergen_flags: [],
    confidence: null,
    model: null,
    prompt_version: null,
  };
}

function toLegacyAnalyzeLabelResponse(labelSummary) {
  if (!labelSummary) return {};
  return {
    product_name: labelSummary.product_name,
    detected_label_text: labelSummary.detected_label_text,
    what_it_is: labelSummary.what_it_is,
    what_people_commonly_use_it_for: labelSummary.what_people_commonly_use_it_for,
    what_sources_say: labelSummary.what_sources_say,
    questions_to_ask_a_professional: labelSummary.questions_to_ask_a_professional,
    neutral_disclaimer: labelSummary.neutral_disclaimer,
  };
}

function toClientScanResponse({ product, analysis, scan, labelSummary }) {
  const legacy = labelSummary ? toLegacyAnalyzeLabelResponse(labelSummary) : {};
  const labelFacts = {
    ingredients_text: product.ingredients_text || null,
    extracted_text: labelSummary?.detected_label_text || scan?.extracted_text || null,
    nutrition_data: product.nutrition_data || {},
  };

  return {
    ...legacy,
    persisted: true,
    product,
    analysis,
    scan,
    label_facts: labelFacts,
    ai_context: labelSummary
      ? {
          sections: analysis?.positives || [],
          disclaimer: analysis?.summary || labelSummary.neutral_disclaimer,
        }
      : null,
    sources: buildSourceAttribution(product, labelSummary),
  };
}

module.exports = {
  normalizeFromOpenFoodFacts,
  normalizeFromUsda,
  normalizeFromOpenAi,
  mergeProductRecords,
  buildAnalysisFromLabelSummary,
  buildBarcodeOnlyAnalysis,
  buildSourceAttribution,
  toLegacyAnalyzeLabelResponse,
  toClientScanResponse,
};
