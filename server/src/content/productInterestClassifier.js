const { isGenericTerm } = require('./genericTerms');

const KNOWN_INGREDIENTS = {
  'magnesium glycinate': {
    primaryIngredient: 'magnesium glycinate',
    broaderIngredient: 'magnesium',
    category: 'dietary_supplement',
    lifestyleTopics: ['sleep routines', 'relaxation', 'muscle function', 'supplementation'],
    commonClaims: ['sleep support', 'calm', 'recovery'],
    trendTerms: ['magnesium forms', 'sleep supplements'],
  },
  magnesium: {
    primaryIngredient: 'magnesium',
    broaderIngredient: 'magnesium',
    category: 'dietary_supplement',
    lifestyleTopics: ['sleep routines', 'relaxation', 'muscle function', 'supplementation'],
    commonClaims: ['sleep support', 'calm', 'recovery'],
    trendTerms: ['magnesium supplements'],
  },
  ibuprofen: {
    activeIngredient: 'ibuprofen',
    category: 'otc_medication',
    lifestyleTopics: ['pain relief', 'medicine cabinet'],
    commonClaims: ['pain relief', 'fever reduction'],
    trendTerms: ['otc pain relief'],
  },
  melatonin: {
    primaryIngredient: 'melatonin',
    category: 'dietary_supplement',
    lifestyleTopics: ['sleep routines'],
    commonClaims: ['sleep support'],
    trendTerms: ['sleep supplements'],
  },
  creatine: {
    primaryIngredient: 'creatine',
    category: 'dietary_supplement',
    lifestyleTopics: ['movement', 'recovery'],
    commonClaims: ['exercise support'],
    trendTerms: ['sports supplements'],
  },
  probiotic: {
    primaryIngredient: 'probiotics',
    category: 'dietary_supplement',
    lifestyleTopics: ['everyday nutrition', 'digestive wellness'],
    commonClaims: ['digestive support'],
    trendTerms: ['gut health products'],
  },
  turmeric: {
    primaryIngredient: 'turmeric',
    category: 'dietary_supplement',
    lifestyleTopics: ['alternative wellness', 'everyday nutrition'],
    commonClaims: ['wellness support'],
    trendTerms: ['herbal supplements'],
  },
  ashwagandha: {
    primaryIngredient: 'ashwagandha',
    category: 'dietary_supplement',
    lifestyleTopics: ['stress and relaxation', 'adaptogens'],
    commonClaims: ['stress support', 'calm'],
    trendTerms: ['adaptogen products'],
  },
};

const CATEGORY_RULES = [
  {
    pattern: /\b(bottled water|spring water|purified water|drinking water|mineral water|sparkling water)\b/i,
    productCategory: 'bottled_water',
    broaderCategory: 'beverages',
    lifestyleTopics: ['hydration'],
    researchPriority: 'low',
    lifestylePriority: 'medium',
    labelTopics: ['hydration', 'bottled water labels', 'electrolytes when listed'],
  },
  {
    pattern: /\bhummus\b/i,
    productCategory: 'packaged_food',
    broaderCategory: 'refrigerated_dips',
    lifestyleTopics: ['everyday nutrition', 'snacking'],
    meaningfulIngredients: ['chickpeas', 'tahini', 'sesame'],
    allergenTopics: ['sesame', 'tahini'],
    researchPriority: 'low',
    lifestylePriority: 'medium',
    labelTopics: ['allergens', 'serving size', 'sodium'],
  },
  {
    pattern: /\b(ibuprofen|advil|motrin)\b/i,
    productCategory: 'otc_medication',
    broaderCategory: 'pain_relief',
    activeIngredient: 'ibuprofen',
    lifestyleTopics: ['medicine cabinet', 'pain relief', 'label warnings'],
    researchPriority: 'medium',
    lifestylePriority: 'medium',
    labelTopics: ['active ingredient', 'warnings', 'directions'],
  },
  {
    pattern: /\b(magnesium glycinate|magnesium)\b/i,
    productCategory: 'dietary_supplement',
    broaderCategory: 'minerals',
    lifestyleTopics: ['sleep routines', 'relaxation', 'supplementation'],
    researchPriority: 'medium',
    lifestylePriority: 'high',
    labelTopics: ['supplement facts', 'form of magnesium', 'other ingredients'],
  },
  {
    pattern: /\b(supplement|vitamin|capsule|softgel|gummy|powder)\b/i,
    productCategory: 'dietary_supplement',
    broaderCategory: 'supplements',
    lifestyleTopics: ['supplement literacy'],
    researchPriority: 'medium',
    lifestylePriority: 'medium',
    labelTopics: ['supplement facts', 'claims', 'other ingredients'],
  },
  {
    pattern: /\b(homeopathic|essential oil|herbal|botanical)\b/i,
    productCategory: 'alternative_wellness',
    broaderCategory: 'alternative_wellness',
    lifestyleTopics: ['alternative wellness', 'claims and marketing language'],
    researchPriority: 'low',
    lifestylePriority: 'medium',
    labelTopics: ['claims', 'ingredient transparency'],
  },
];

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function extractMeaningfulIngredients(ingredientsText) {
  const text = String(ingredientsText || '').toLowerCase();
  const found = [];
  for (const key of Object.keys(KNOWN_INGREDIENTS)) {
    if (text.includes(key)) found.push(key);
  }
  const chunks = String(ingredientsText || '')
    .split(/[,;()]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
  for (const chunk of chunks.slice(0, 8)) {
    const normalized = chunk.toLowerCase();
    if (!isGenericTerm(normalized) && normalized.split(/\s+/).length <= 4) {
      found.push(normalized);
    }
  }
  return [...new Set(found)].slice(0, 8);
}

function extractLabelClaims(product, analysis) {
  const claims = [];
  const text = [
    product?.name,
    product?.ingredients_text,
    analysis?.summary,
    ...(Array.isArray(analysis?.positives) ? analysis.positives.map((item) => item.body) : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const claimPatterns = [
    'natural',
    'organic',
    'non-gmo',
    'immune support',
    'sleep support',
    'clinically tested',
    'doctor formulated',
    'detox',
    'clean',
    'bioavailable',
    'supports',
    'helps',
  ];
  for (const claim of claimPatterns) {
    if (text.includes(claim)) claims.push(claim);
  }
  return [...new Set(claims)];
}

function derivePersonalizationStrength({ scanCount = 1, isSaved = false, researchPriority = 'medium' }) {
  if (isSaved) return 'high';
  if (scanCount >= 3) return 'high';
  if (scanCount >= 2) return 'medium';
  if (researchPriority === 'low') return 'low';
  return scanCount > 1 ? 'medium' : 'low';
}

function buildSafetyMonitoringTerms({ brand, productCategory, activeIngredient, primaryIngredient, productName }) {
  const terms = [];
  if (brand && !isGenericTerm(brand)) terms.push(brand);
  if (activeIngredient) terms.push(`${activeIngredient} recall`);
  if (primaryIngredient && primaryIngredient !== activeIngredient) {
    terms.push(`${primaryIngredient} supplement recall`);
  }
  if (productCategory === 'bottled_water') terms.push('bottled water recall');
  if (productCategory === 'packaged_food' && brand) terms.push(`${brand} food recall`);
  if (productCategory === 'otc_medication' && brand) terms.push(`${brand} drug recall`);
  if (productName && productCategory === 'packaged_food') {
    const shortName = productName.split(/\s+/).slice(0, 2).join(' ');
    if (!isGenericTerm(shortName)) terms.push(shortName);
  }
  return [...new Set(terms.filter(Boolean))];
}

function buildPubMedConcepts(profile) {
  if (profile.researchPriority === 'low') return [];

  const concepts = [];
  if (profile.activeIngredient) {
    concepts.push(`${profile.activeIngredient} consumer safety review`);
    concepts.push(`${profile.activeIngredient} medication label`);
  } else if (profile.primaryIngredient) {
    concepts.push(`${profile.primaryIngredient} supplementation review`);
    if (profile.lifestyleTopics.includes('sleep routines')) {
      concepts.push(`${profile.primaryIngredient} sleep review`);
    }
  }

  return concepts.filter((concept) => {
    const tokens = tokenize(concept);
    return tokens.some((token) => !isGenericTerm(token));
  });
}

function classifyProduct(product, options = {}) {
  const { scanCount = 1, isSaved = false, analysis = null } = options;
  const name = product?.name || '';
  const brand = product?.brand || null;
  const ingredientsText = product?.ingredients_text || '';
  const haystack = `${name} ${brand || ''} ${ingredientsText}`.toLowerCase();

  let matchedRule = null;
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(haystack)) {
      matchedRule = rule;
      break;
    }
  }

  let ingredientMatch = null;
  for (const [key, value] of Object.entries(KNOWN_INGREDIENTS)) {
    if (haystack.includes(key)) {
      ingredientMatch = { key, ...value };
      break;
    }
  }

  const meaningfulIngredients = [
    ...(matchedRule?.meaningfulIngredients || []),
    ...extractMeaningfulIngredients(ingredientsText),
  ].filter((term) => !isGenericTerm(term));

  const profile = {
    productName: name || 'Unknown product',
    brand,
    productCategory: matchedRule?.productCategory || ingredientMatch?.category || 'wellness_product',
    broaderCategory: matchedRule?.broaderCategory || ingredientMatch?.category || 'wellness',
    meaningfulIngredients: [...new Set(meaningfulIngredients)],
    primaryIngredient: ingredientMatch?.primaryIngredient || null,
    broaderIngredient: ingredientMatch?.broaderIngredient || ingredientMatch?.primaryIngredient || null,
    activeIngredient: matchedRule?.activeIngredient || ingredientMatch?.activeIngredient || null,
    allergens: Array.isArray(product?.ingredients_data?.tags)
      ? product.ingredients_data.tags
          .filter((tag) => String(tag).includes('allergen'))
          .map((tag) => String(tag).replace(/^en:/, ''))
      : matchedRule?.allergenTopics || [],
    productForm: null,
    labelClaims: extractLabelClaims(product, analysis),
    lifestyleTopics: [
      ...(matchedRule?.lifestyleTopics || []),
      ...(ingredientMatch?.lifestyleTopics || []),
    ],
    safetyMonitoringTerms: [],
    trendMonitoringTerms: ingredientMatch?.trendTerms || [],
    researchPriority: matchedRule?.researchPriority || (ingredientMatch ? 'medium' : 'low'),
    lifestylePriority: matchedRule?.lifestylePriority || 'medium',
    labelTopics: matchedRule?.labelTopics || ['product labels', 'ingredient lists'],
    personalizationStrength: 'low',
    confidence: matchedRule || ingredientMatch ? 0.82 : 0.55,
  };

  profile.safetyMonitoringTerms = buildSafetyMonitoringTerms({
    brand: profile.brand,
    productCategory: profile.productCategory,
    activeIngredient: profile.activeIngredient,
    primaryIngredient: profile.primaryIngredient,
    productName: profile.productName,
  });

  profile.personalizationStrength = derivePersonalizationStrength({
    scanCount,
    isSaved,
    researchPriority: profile.researchPriority,
  });

  profile.pubmedConcepts = buildPubMedConcepts(profile);
  profile.searchConcepts = {
    fda: profile.safetyMonitoringTerms,
    pubmed: profile.pubmedConcepts,
    lifestyle: profile.lifestyleTopics,
    claims: profile.labelClaims,
  };

  return profile;
}

function buildUserInterestModel({ scans = [], savedProducts = [] }) {
  const productStats = new Map();

  for (const scan of scans) {
    if (!scan?.product?.id) continue;
    const current = productStats.get(scan.product.id) || {
      product: scan.product,
      analysis: scan.analysis,
      scanCount: 0,
      isSaved: false,
    };
    current.scanCount += 1;
    current.analysis = scan.analysis || current.analysis;
    productStats.set(scan.product.id, current);
  }

  for (const saved of savedProducts) {
    if (!saved?.product?.id) continue;
    const current = productStats.get(saved.product.id) || {
      product: saved.product,
      analysis: saved.analysis,
      scanCount: 0,
      isSaved: false,
    };
    current.isSaved = true;
    current.analysis = saved.analysis || current.analysis;
    productStats.set(saved.product.id, current);
  }

  const profiles = [...productStats.entries()].map(([productId, entry]) => ({
    productId,
    ...classifyProduct(entry.product, {
      scanCount: entry.scanCount,
      isSaved: entry.isSaved,
      analysis: entry.analysis,
    }),
  }));

  const categoryCounts = new Map();
  const ingredientCounts = new Map();
  const claimCounts = new Map();
  const lifestyleTopics = new Set();

  for (const profile of profiles) {
    categoryCounts.set(profile.productCategory, (categoryCounts.get(profile.productCategory) || 0) + 1);
    for (const ingredient of [profile.primaryIngredient, profile.activeIngredient, ...profile.meaningfulIngredients]) {
      if (!ingredient || isGenericTerm(ingredient)) continue;
      ingredientCounts.set(ingredient, (ingredientCounts.get(ingredient) || 0) + 1);
    }
    for (const claim of profile.labelClaims) {
      claimCounts.set(claim, (claimCounts.get(claim) || 0) + 1);
    }
    for (const topic of profile.lifestyleTopics) lifestyleTopics.add(topic);
  }

  return {
    profiles,
    aggregates: {
      categoryCounts: Object.fromEntries(categoryCounts),
      ingredientCounts: Object.fromEntries(ingredientCounts),
      claimCounts: Object.fromEntries(claimCounts),
      lifestyleTopics: [...lifestyleTopics],
    },
    hasPersonalization: profiles.length > 0,
  };
}

module.exports = {
  classifyProduct,
  buildUserInterestModel,
  buildPubMedConcepts,
  buildSafetyMonitoringTerms,
};
