const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scanScreen = fs.readFileSync(
  path.join(__dirname, '../../screens/ScanScreen.js'),
  'utf8'
);

assert.match(
  scanScreen,
  /title="Choose label photo"/,
  'choose screen must expose library picker'
);
assert.match(scanScreen, /returnToChoose/, 'denied camera permission must return to choose screen');

const chooseIndex = scanScreen.indexOf('Scan a product');
const earlyPermissionGate =
  /if\s*\(\s*!permission\s*\)/.test(scanScreen) ||
  /if\s*\(\s*!permission\.granted\s*\)/.test(scanScreen);
assert.ok(chooseIndex !== -1, 'choose screen copy must exist');
assert.ok(!earlyPermissionGate, 'camera permission must not gate the initial choose screen');
assert.match(scanScreen, /startBarcodeMode/, 'barcode flow must request permission lazily');
assert.match(scanScreen, /chooseFromLibrary/, 'library picker must remain available');

const hydrationHook = fs.readFileSync(
  path.join(__dirname, '../../hooks/useWellumiData.js'),
  'utf8'
);
assert.match(hydrationHook, /Promise\.allSettled/, 'hydration must use Promise.allSettled');
assert.match(hydrationHook, /scansError/, 'hydration must track scans error separately');
assert.match(hydrationHook, /feedError/, 'hydration must track feed error separately');
assert.match(hydrationHook, /const clear = useCallback/, 'hydration hook must expose clear');

const useProfileHook = fs.readFileSync(
  path.join(__dirname, '../../hooks/useProfile.js'),
  'utf8'
);
assert.match(useProfileHook, /PROFILE_STATES/, 'profile hook must expose explicit profile states');
assert.match(useProfileHook, /refreshGenerationRef/, 'profile refresh must guard stale in-flight requests');
assert.match(useProfileHook, /shouldShowOnboarding/, 'onboarding routing must wait for resolved profile');

const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
assert.match(appSource, /Saving your Wellumi/, 'auth transition must show neutral loading state');
assert.match(appSource, /Could not load your profile/, 'profile bootstrap errors must surface with retry');
assert.doesNotMatch(appSource, /profileState\.profile && profileState\.needsOnboarding/, 'avoid stale-profile onboarding flash');

console.log('verify-client-flows: all static checks passed');
