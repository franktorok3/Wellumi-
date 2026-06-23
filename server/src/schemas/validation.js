const { z } = require('zod');
const {
  MAX_BASE64_LENGTH,
  MAX_IMAGE_BYTES,
  normalizeMimeType,
  validateImagePayload,
} = require('../utils/imageValidation');

const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, 'barcode must be 8-14 digits')
  .optional();

const analyzeLabelRequestSchema = z
  .object({
    imageBase64: z
      .string()
      .min(1)
      .max(MAX_BASE64_LENGTH, `imageBase64 must be at most ${MAX_BASE64_LENGTH} characters`)
      .optional(),
    mimeType: z.string().min(3).default('image/jpeg'),
    barcode: barcodeSchema,
  })
  .refine((value) => Boolean(value.imageBase64 || value.barcode), {
    message: 'imageBase64 or barcode is required',
  })
  .superRefine((value, ctx) => {
    if (!value.imageBase64) {
      return;
    }

    try {
      validateImagePayload({
        imageBase64: value.imageBase64,
        mimeType: normalizeMimeType(value.mimeType),
      });
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error.message,
      });
    }
  });

const saveProductRequestSchema = z.object({
  productId: z.string().uuid(),
  analysisId: z.string().uuid().optional(),
  scanId: z.string().uuid().optional(),
});

const preferencesSchema = z.object({
  selected_interests: z.array(z.string()).default([]),
  selected_use_cases: z.array(z.string()).default([]),
  content_balance: z.record(z.string()).default({}),
  limited_topics: z.array(z.string()).default([]),
  preferred_feed_mix: z.record(z.unknown()).default({}),
  notifications: z.record(z.unknown()).default({}),
});

const onboardingStepSchema = z.object({
  step: z.string().min(1),
  draft: preferencesSchema.partial().optional(),
});

const patchMeSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  last_seen_at: z.string().optional(),
});

const storyFeedbackSchema = z.object({
  feedback_type: z.enum([
    'opened',
    'source_opened',
    'saved',
    'dismissed',
    'more_like_this',
    'less_like_this',
    'not_relevant',
  ]),
  metadata: z.record(z.unknown()).default({}),
});

const accountUpgradeSchema = z.object({
  account_type: z.enum(['email', 'apple']),
});

const openAiLabelSummarySchema = z.object({
  product_name: z.string().min(1),
  detected_label_text: z.string().default(''),
  what_it_is: z.string().min(1),
  what_people_commonly_use_it_for: z.string().min(1),
  what_sources_say: z.string().min(1),
  questions_to_ask_a_professional: z.array(z.string().min(1)).min(1),
  neutral_disclaimer: z.string().min(1),
});

const openFoodFactsProductSchema = z
  .object({
    code: z.string().optional(),
    product_name: z.string().optional(),
    brands: z.string().optional(),
    ingredients_text: z.string().optional(),
    ingredients: z.array(z.unknown()).optional(),
    nutriments: z.record(z.unknown()).optional(),
    image_url: z.string().optional(),
    image_front_url: z.string().optional(),
    image_front_small_url: z.string().optional(),
  })
  .passthrough();

const openFoodFactsResponseSchema = z.object({
  status: z.number(),
  product: openFoodFactsProductSchema.optional(),
});

const usdaFoodSchema = z
  .object({
    fdcId: z.number(),
    description: z.string(),
    brandOwner: z.string().optional(),
    ingredients: z.string().optional(),
    foodNutrients: z.array(z.unknown()).optional(),
  })
  .passthrough();

const usdaSearchResponseSchema = z.object({
  foods: z.array(usdaFoodSchema).default([]),
  totalHits: z.number().optional(),
});

function validateBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return parsed.data;
}

module.exports = {
  analyzeLabelRequestSchema,
  saveProductRequestSchema,
  preferencesSchema,
  onboardingStepSchema,
  patchMeSchema,
  storyFeedbackSchema,
  accountUpgradeSchema,
  openAiLabelSummarySchema,
  openFoodFactsResponseSchema,
  usdaSearchResponseSchema,
  validateBody,
  MAX_IMAGE_BYTES,
  MAX_BASE64_LENGTH,
};
