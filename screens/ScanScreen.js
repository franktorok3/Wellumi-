import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { submitScan } from '../services/api';
import { colors } from '../theme/tokens';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'];

export default function ScanScreen({
  styles,
  Icon,
  PrimaryButton,
  SecondaryButton,
  onBack,
  onResult,
}) {
  const { width } = useWindowDimensions();
  const guideSize = Math.min(Math.max(width - 96, 180), 240);
  const cameraRef = useRef(null);
  const lastBarcodeRef = useRef({ value: null, at: 0 });
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState('choose');
  const [photo, setPhoto] = useState(null);
  const [barcode, setBarcode] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  async function captureLabel() {
    if (!cameraRef.current || isCapturing) return;
    try {
      setIsCapturing(true);
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.82,
        skipProcessing: false,
        base64: true,
      });
      setPhoto({ ...picture, mimeType: 'image/jpeg' });
      setMode('review-photo');
      setAnalysisError('');
    } finally {
      setIsCapturing(false);
    }
  }

  async function chooseFromLibrary() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setAnalysisError('Photo library access is needed to choose a label image.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: true,
    });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setPhoto({
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType || 'image/jpeg',
    });
    setMode('review-photo');
    setAnalysisError('');
  }

  function handleBarcodeScanned(event) {
    const value = event?.data;
    if (!value) return;
    const now = Date.now();
    if (lastBarcodeRef.current.value === value && now - lastBarcodeRef.current.at < 2500) {
      return;
    }
    lastBarcodeRef.current = { value, at: now };
    setBarcode(value);
    setMode('review-barcode');
    setAnalysisError('');
  }

  async function analyzeCurrentInput() {
    if (isAnalyzing) return;
    if (!photo?.base64 && !barcode) {
      setAnalysisError('Add a barcode or label photo before analyzing.');
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisError('');
      const result = await submitScan({ photo, barcode });
      onResult(result);
    } catch (error) {
      const message = error?.message || 'Wellumi could not complete this scan.';
      setAnalysisError(message);
      if (__DEV__) {
        console.log('[wellumi-scan] failed', { code: error?.code, message });
      }
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.cameraShell}>
        <HeaderBack styles={styles} onBack={onBack} />
        <View style={styles.permissionCard}>
          <Icon name="scan" color={colors.green} size={72} />
          <Text style={styles.permissionTitle}>Preparing camera</Text>
          <Text style={styles.permissionBody}>Wellumi is checking camera access.</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.cameraShell}>
        <HeaderBack styles={styles} onBack={onBack} />
        <View style={styles.permissionCard}>
          <Icon name="scan" color={colors.green} size={72} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            Allow camera access to scan barcodes or capture a supplement label.
          </Text>
          <PrimaryButton title="Allow camera" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  if (mode === 'review-photo' && photo) {
    return (
      <View style={styles.cameraShell}>
        <HeaderBack styles={styles} onBack={onBack} />
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Review label</Text>
          <Text style={styles.cameraSubtitle}>
            Confirm the label is readable before Wellumi analyzes it.
          </Text>
          {!!barcode && <Text style={styles.scanMetaText}>Barcode: {barcode}</Text>}
        </View>
        <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        {!!analysisError && <Text style={styles.analysisError}>{analysisError}</Text>}
        <View style={styles.cameraActions}>
          <PrimaryButton
            title={isAnalyzing ? 'Analyzing label...' : 'Analyze label'}
            onPress={analyzeCurrentInput}
            disabled={isAnalyzing}
          />
          <SecondaryButton
            title="Choose another"
            onPress={() => {
              setPhoto(null);
              setMode('choose');
            }}
            disabled={isAnalyzing}
          />
          <SecondaryButton
            title="Retake photo"
            onPress={() => {
              setPhoto(null);
              setMode('photo');
            }}
            disabled={isAnalyzing}
          />
        </View>
      </View>
    );
  }

  if (mode === 'review-barcode' && barcode) {
    return (
      <View style={styles.cameraShell}>
        <HeaderBack styles={styles} onBack={onBack} />
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Barcode detected</Text>
          <Text style={styles.barcodeValue}>{barcode}</Text>
          <Text style={styles.permissionBody}>
            Wellumi will look up this product in Open Food Facts. If details are incomplete, you can add a label photo next.
          </Text>
          {!!analysisError && <Text style={styles.analysisError}>{analysisError}</Text>}
          <PrimaryButton
            title={isAnalyzing ? 'Looking up product...' : 'Look up barcode'}
            onPress={analyzeCurrentInput}
            disabled={isAnalyzing}
          />
          <SecondaryButton
            title="Rescan barcode"
            onPress={() => {
              setBarcode(null);
              setMode('barcode');
            }}
            disabled={isAnalyzing}
          />
          <SecondaryButton
            title="Add label photo"
            onPress={() => setMode('photo')}
            disabled={isAnalyzing}
          />
        </View>
      </View>
    );
  }

  if (mode === 'barcode') {
    return (
      <View style={styles.cameraShell}>
        <CameraView
          style={styles.cameraPreview}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={handleBarcodeScanned}
        >
          <View style={styles.cameraOverlay}>
            <Pressable style={styles.cameraBackButtonDark} onPress={() => setMode('choose')}>
              <Text style={styles.cameraBackTextDark}>Back</Text>
            </Pressable>
            <Text style={styles.cameraGuideText}>Align the barcode inside the frame</Text>
          </View>
        </CameraView>
      </View>
    );
  }

  if (mode === 'photo') {
    return (
      <View style={styles.cameraShell}>
        <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back">
          <View style={styles.cameraOverlay}>
            <Pressable style={styles.cameraBackButtonDark} onPress={() => setMode('choose')}>
              <Text style={styles.cameraBackTextDark}>Back</Text>
            </Pressable>
            <View style={styles.cameraGuide}>
              <View style={[styles.cameraGuideCorner, { width: guideSize, height: guideSize }]} />
              <Text style={styles.cameraGuideText}>Frame the label clearly</Text>
            </View>
            <View style={styles.capturePanel}>
              <Pressable
                style={({ pressed }) => [
                  styles.captureButton,
                  isCapturing && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
                onPress={captureLabel}
                disabled={isCapturing}
              >
                <Text style={styles.captureButtonText}>
                  {isCapturing ? 'Capturing...' : 'Capture label'}
                </Text>
              </Pressable>
              <SecondaryButton title="Choose from library" onPress={chooseFromLibrary} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <View style={styles.cameraShell}>
      <HeaderBack styles={styles} onBack={onBack} />
      <View style={styles.permissionCard}>
        <Text style={styles.permissionTitle}>Scan a product</Text>
        <Text style={styles.permissionBody}>
          Choose how you want to identify the product. Wellumi uses real external sources and only uses AI for label context.
        </Text>
        <PrimaryButton title="Scan barcode" onPress={() => setMode('barcode')} />
        <SecondaryButton title="Take label photo" onPress={() => setMode('photo')} />
        <SecondaryButton title="Choose label photo" onPress={chooseFromLibrary} />
      </View>
    </View>
  );
}

function HeaderBack({ styles, onBack }) {
  return (
    <Pressable style={styles.cameraBackButton} onPress={onBack}>
      <Text style={styles.cameraBackText}>Back</Text>
    </Pressable>
  );
}
