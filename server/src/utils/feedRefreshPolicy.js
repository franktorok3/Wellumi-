function hasSuccessfulProvider(providerResults) {
  return providerResults.some((result) => result.success);
}

function isCompleteProviderFailure(providerResults) {
  return providerResults.length > 0 && providerResults.every((result) => !result.success);
}

module.exports = {
  hasSuccessfulProvider,
  isCompleteProviderFailure,
};
