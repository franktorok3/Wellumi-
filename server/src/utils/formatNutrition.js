const NUTRIENT_LABELS = {
  proteins_100g: { label: 'Protein', unit: 'g', basis: 'per 100 g' },
  sodium_100g: { label: 'Sodium', unit: 'g', basis: 'per 100 g' },
};

function roundValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function formatNutritionEntries(nutritionData) {
  if (!nutritionData?.per_100g) return [];
  return Object.entries(nutritionData.per_100g)
    .map(([key, rawValue]) => {
      const value = roundValue(Number(rawValue));
      if (value == null || value === 0) return null;
      const meta = NUTRIENT_LABELS[key] || {
        label: key.replace(/_/g, ' ').replace(/100g/i, '').trim(),
        unit: key.includes('_g') ? 'g' : '',
        basis: 'per 100 g',
      };
      return {
        key,
        display: `${meta.label}: ${value}${meta.unit ? ` ${meta.unit}` : ''} (${meta.basis})`,
      };
    })
    .filter(Boolean);
}

module.exports = {
  roundValue,
  formatNutritionEntries,
};
