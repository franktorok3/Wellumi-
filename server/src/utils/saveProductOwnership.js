function ownershipError(message, statusCode = 403) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function verifySaveProductOwnership(supabase, userId, { productId, analysisId, scanId }) {
  if (analysisId) {
    const { data: analysis, error } = await supabase
      .from('analyses')
      .select('id, user_id, product_id')
      .eq('id', analysisId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not verify analysis ownership: ${error.message}`);
    }
    if (!analysis) {
      throw ownershipError('Analysis not found.', 404);
    }
    if (analysis.user_id !== userId) {
      throw ownershipError('Analysis does not belong to the authenticated user.', 403);
    }
    if (analysis.product_id !== productId) {
      throw ownershipError('Analysis does not belong to the submitted product.', 403);
    }
  }

  if (scanId) {
    const { data: scan, error } = await supabase
      .from('scans')
      .select('id, user_id, product_id, analysis_id')
      .eq('id', scanId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not verify scan ownership: ${error.message}`);
    }
    if (!scan) {
      throw ownershipError('Scan not found.', 404);
    }
    if (scan.user_id !== userId) {
      throw ownershipError('Scan does not belong to the authenticated user.', 403);
    }
    if (scan.product_id !== productId) {
      throw ownershipError('Scan does not belong to the submitted product.', 403);
    }
    if (analysisId && scan.analysis_id !== analysisId) {
      throw ownershipError('Scan does not belong to the submitted analysis.', 403);
    }
  }
}

module.exports = {
  verifySaveProductOwnership,
};
