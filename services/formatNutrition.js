export const CANONICAL_NUTRIENTS = [
  { key: 'energy', label: 'Energy', unit: 'kcal', aliases: ['energy_kcal_100g', 'energy-kcal_100g', 'energy-kcal', 'energy_100g', 'energy-kj_100g', 'energy_kj_100g'] },
  { key: 'fat', label: 'Fat', unit: 'g', aliases: ['fat_100g', 'fat', 'total-fat_100g', 'total_fat_100g'] },
  { key: 'saturated_fat', label: 'Saturated fat', unit: 'g', aliases: ['saturated-fat_100g', 'saturated_fat_100g', 'saturated-fat', 'saturated_fat'] },
  { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g', aliases: ['carbohydrates_100g', 'carbohydrates', 'carbohydrate_100g'] },
  { key: 'sugars', label: 'Sugars', unit: 'g', aliases: ['sugars_100g', 'sugars', 'sugar_100g'] },
  { key: 'fiber', label: 'Fiber', unit: 'g', aliases: ['fiber_100g', 'fiber', 'fibre_100g', 'fibre'] },
  { key: 'protein', label: 'Protein', unit: 'g', aliases: ['proteins_100g', 'protein_100g', 'proteins', 'protein'] },
  { key: 'sodium', label: 'Sodium', unit: 'g', aliases: ['sodium_100g', 'sodium'] },
  { key: 'salt', label: 'Salt', unit: 'g', aliases: ['salt_100g', 'salt'] },
];

const EXCLUDED_KEYS = new Set([
  'nova-group',
  'nova_group',
  'nova-group_100g',
  'nova_group_100g',
  'nutriscore_grade',
  'nutrition-score-fr_100g',
  'nutrition-score-uk_100g',
]);

export function roundValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function readNumeric(value) {
  const parsed = Number(value);
  return roundValue(parsed);
}

function buildAliasMap() {
  const map = new Map();
  for (const nutrient of CANONICAL_NUTRIENTS) {
    for (const alias of nutrient.aliases) {
      map.set(normalizeKey(alias), nutrient.key);
    }
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

export function formatNutritionEntries(nutritionData) {
  if (!nutritionData) return { basis: null, entries: [] };

  if (Array.isArray(nutritionData.nutrients)) {
    const entries = nutritionData.nutrients
      .map((item) => {
        const value = readNumeric(item.amount);
        if (value == null || value === 0) return null;
        return {
          key: item.name,
          label: item.name,
          value,
          unit: item.unit || '',
          display: `${item.name}: ${value}${item.unit ? ` ${item.unit}` : ''}`,
        };
      })
      .filter(Boolean);
    return { basis: 'per serving', entries };
  }

  const per100g = nutritionData.per_100g || {};
  const canonicalValues = new Map();

  for (const [rawKey, rawValue] of Object.entries(per100g)) {
    const normalized = normalizeKey(rawKey);
    if (EXCLUDED_KEYS.has(normalized)) continue;
    const canonicalKey = ALIAS_MAP.get(normalized);
    if (!canonicalKey) continue;
    const value = readNumeric(rawValue);
    if (value == null || value === 0) continue;
    if (!canonicalValues.has(canonicalKey)) {
      canonicalValues.set(canonicalKey, value);
    }
  }

  if (canonicalValues.has('sodium') && canonicalValues.has('salt')) {
    canonicalValues.delete('sodium');
  }

  const entries = CANONICAL_NUTRIENTS.map((nutrient) => {
    const value = canonicalValues.get(nutrient.key);
    if (value == null) return null;
    return {
      key: nutrient.key,
      label: nutrient.label,
      value,
      unit: nutrient.unit,
      display: `${nutrient.label}: ${value} ${nutrient.unit}`,
    };
  }).filter(Boolean);

  return {
    basis: entries.length ? 'per 100 g' : null,
    entries,
  };
}
