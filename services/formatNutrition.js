export const NUTRIENT_LABELS = {
  energy_kcal_100g: { label: 'Energy', unit: 'kcal', basis: 'per 100 g' },
  energy_kj_100g: { label: 'Energy', unit: 'kJ', basis: 'per 100 g' },
  proteins_100g: { label: 'Protein', unit: 'g', basis: 'per 100 g' },
  carbohydrates_100g: { label: 'Carbohydrates', unit: 'g', basis: 'per 100 g' },
  fat_100g: { label: 'Fat', unit: 'g', basis: 'per 100 g' },
  sugars_100g: { label: 'Sugars', unit: 'g', basis: 'per 100 g' },
  fiber_100g: { label: 'Fiber', unit: 'g', basis: 'per 100 g' },
  sodium_100g: { label: 'Sodium', unit: 'g', basis: 'per 100 g' },
  salt_100g: { label: 'Salt', unit: 'g', basis: 'per 100 g' },
};

export function roundValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function formatNutritionEntries(nutritionData) {
  if (!nutritionData) return [];

  if (Array.isArray(nutritionData.nutrients)) {
    return nutritionData.nutrients
      .map((item) => {
        const amount = roundValue(item.amount);
        if (amount == null) return null;
        return {
          key: item.name,
          label: item.name,
          value: amount,
          unit: item.unit || '',
          basis: 'per serving',
          display: `${item.name}: ${amount}${item.unit ? ` ${item.unit}` : ''} per serving`,
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  const per100g = nutritionData.per_100g || {};
  return Object.entries(per100g)
    .map(([key, rawValue]) => {
      const value = roundValue(Number(rawValue));
      if (value == null || value === 0) return null;
      const meta = NUTRIENT_LABELS[key] || {
        label: key.replace(/_/g, ' ').replace(/100g/i, '').trim(),
        unit: key.includes('_g') ? 'g' : key.includes('kcal') ? 'kcal' : key.includes('kj') ? 'kJ' : '',
        basis: 'per 100 g',
      };
      return {
        key,
        label: meta.label,
        value,
        unit: meta.unit,
        basis: meta.basis,
        display: `${meta.label}: ${value}${meta.unit ? ` ${meta.unit}` : ''} (${meta.basis})`,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}
