import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';

// Change this to your computer's local network IP when testing on a phone.
// Do not use localhost on a phone; localhost points to the phone, not this computer.
const API_BASE_URL = "http://192.168.68.66:3001";
const LABEL_ANALYSIS_TIMEOUT_MS = 60000;

const colors = {
  cream: '#FBF8F1',
  card: '#FFFDF8',
  cardSoft: '#F7F4EC',
  green: '#3F794D',
  greenDark: '#193D2B',
  greenSoft: '#EAF0E6',
  greenMuted: '#B8C8AD',
  ink: '#16291F',
  muted: '#6E716D',
  mutedLight: '#8A8F8C',
  line: '#E9E4DA',
  shadow: '#3A3328',
  white: '#FFFFFF',
  heroText: '#E7EFE6',
  surfaceWarm: '#F1EBDD',
  surfaceMuted: '#EEF0E8',
  tabInactive: '#5B6060',
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
};

const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.2 },
  displaySm: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.1 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
  micro: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
};

const layout = {
  screenPaddingX: spacing.xl,
  screenPaddingTop: spacing.md,
  screenPaddingBottom: 132,
  sectionGap: spacing.xl,
  cardGap: spacing.md - 1,
  contentMaxWidth: 520,
};

const scanItems = [
  { id: 'd3', title: 'Vitamin D3\n2000 IU', time: '2d ago', color: '#F7C633', bottle: '#181F1A' },
  { id: 'ibu', title: 'Ibuprofen\n200mg', time: '4d ago', color: '#2D77B8', bottle: '#F8F7F2' },
  { id: 'omega', title: 'Omega-3\nFish Oil', time: '6d ago', color: '#7A3B25', bottle: '#4B2018' },
];

const defaultFeedArt = [
  {
    id: 'magnesium',
    title: 'Magnesium Glycinate',
    body: 'What the research says',
    palette: ['#D9CAB4', '#F4ECDF', '#BFA98B'],
  },
  {
    id: 'berberine',
    title: 'Berberine',
    body: 'Uses and key benefits',
    palette: ['#1F4F2E', '#7B9A6F', '#DDE8D5'],
  },
  {
    id: 'sleep',
    title: 'Sleep support claims',
    body: 'Ingredients, evidence & more',
    palette: ['#E9DFCF', '#CDBB9E', '#F8F2E8'],
  },
];

const mockFeedLibrary = [
  {
    id: 'zinc-immune-language',
    updateType: 'Label trend',
    title: 'Zinc products and immune wellness language',
    summary: 'A neutral look at common wording used on zinc supplement labels.',
    tag: 'zinc',
    relatedTags: ['zinc', 'supplements', 'label literacy'],
    sourceLabel: 'Source-backed context',
    cta: 'Read update',
    date: 'Today',
    filterType: 'Trends',
    palette: ['#C9B58A', '#F4EBD7', '#7E8B62'],
  },
  {
    id: 'supplement-label-wording',
    updateType: 'Source update',
    title: 'Common wording on supplement facts panels',
    summary: 'A source-literacy reminder to separate product identity, ingredient lists, and marketing language.',
    tag: 'label literacy',
    relatedTags: ['supplements', 'label literacy'],
    sourceLabel: 'Source-backed context',
    cta: 'View context',
    date: 'Updated recently',
    filterType: 'Updates',
    palette: ['#D9CAB4', '#F4ECDF', '#BFA98B'],
  },
  {
    id: 'magnesium-sleep-content',
    updateType: 'Research mention',
    title: 'Magnesium forms are showing up in sleep content',
    summary: 'Recent wellness content often compares magnesium forms. Wellumi keeps the focus on label literacy and questions to ask.',
    tag: 'magnesium',
    relatedTags: ['magnesium', 'sleep', 'supplements'],
    sourceLabel: 'Source-backed context',
    cta: 'Read update',
    date: 'This week',
    filterType: 'Updates',
    palette: ['#D7C4A8', '#F6EDE0', '#A88D70'],
  },
  {
    id: 'sleep-label-language',
    updateType: 'Related topic',
    title: 'Sleep-support wording on wellness labels',
    summary: 'A label-literacy view of common wording around sleep-related products without evaluating product claims.',
    tag: 'sleep',
    relatedTags: ['sleep', 'supplements', 'label literacy'],
    sourceLabel: 'Source-backed context',
    cta: 'View context',
    date: 'Updated recently',
    filterType: 'Updates',
    palette: ['#E9DFCF', '#CDBB9E', '#F8F2E8'],
  },
  {
    id: 'otc-combining-products',
    updateType: 'FDA/consumer update',
    title: 'Reading OTC labels before combining products',
    summary: 'A reminder to review active ingredients and ask a pharmacist when comparing OTC products.',
    tag: 'OTC',
    relatedTags: ['otc', 'pain relief', 'medication questions'],
    sourceLabel: 'Source-backed context',
    cta: 'Read update',
    date: 'Today',
    filterType: 'Updates',
    palette: ['#B8C7D5', '#EEF3F4', '#6F8BA5'],
  },
  {
    id: 'ibuprofen-active-ingredient',
    updateType: 'Question to ask',
    title: 'Active ingredient questions for ibuprofen labels',
    summary: 'A neutral prompt to compare active ingredient names and bring medication questions to a qualified professional.',
    tag: 'ibuprofen',
    relatedTags: ['ibuprofen', 'otc', 'pain relief', 'medication questions'],
    sourceLabel: 'Source-backed context',
    cta: 'View context',
    date: 'This week',
    filterType: 'Scans',
    palette: ['#C3D3E3', '#F2F6F8', '#7F9AB2'],
  },
  {
    id: 'probiotic-label-terms',
    updateType: 'Label trend',
    title: 'Probiotic labels and gut wellness terms',
    summary: 'A plain-language look at strain names, product categories, and common gut wellness marketing terms.',
    tag: 'gut wellness',
    relatedTags: ['probiotic', 'gut wellness', 'supplements', 'label literacy'],
    sourceLabel: 'Source-backed context',
    cta: 'Read update',
    date: 'Updated recently',
    filterType: 'Trends',
    palette: ['#9EBB8E', '#E8F0E2', '#4E6F43'],
  },
  {
    id: 'saved-follow-up',
    updateType: 'Related topic',
    title: 'Turning saved summaries into better questions',
    summary: 'A compact guide for revisiting saved label summaries and preparing questions for a qualified professional.',
    tag: 'saved',
    relatedTags: ['saved', 'label literacy', 'medication questions'],
    sourceLabel: 'Source-backed context',
    cta: 'Save topic',
    date: 'Updated recently',
    filterType: 'Saved Topics',
    palette: ['#D5C2A2', '#F5EEE2', '#8A7659'],
  },
];

function extractAwarenessTags(text) {
  const normalized = String(text || '').toLowerCase();
  const tags = [];

  if (normalized.includes('zinc')) tags.push('zinc', 'supplements', 'label literacy');
  if (normalized.includes('magnesium')) tags.push('magnesium', 'sleep', 'supplements');
  if (normalized.includes('ibuprofen')) tags.push('ibuprofen', 'otc', 'pain relief', 'medication questions');
  if (normalized.includes('otc')) tags.push('otc', 'medication questions');
  if (normalized.includes('probiotic')) tags.push('probiotic', 'gut wellness', 'supplements');
  if (normalized.includes('sleep')) tags.push('sleep', 'supplements');
  if (normalized.includes('claim') || normalized.includes('label')) tags.push('label literacy');

  return [...new Set(tags)];
}

function buildFeedCards(behavior) {
  const savedItems = behavior.savedItems || [];
  const savedTitles = savedItems.map((item) => item.title);
  const activeTags = [
    ...behavior.scans.flatMap((result) =>
      extractAwarenessTags(`${result.title} ${result.detectedLabelText || ''}`)
    ),
    ...behavior.searches.flatMap(extractAwarenessTags),
    ...savedItems.flatMap((item) =>
      extractAwarenessTags(`${item.title} ${item.result?.detectedLabelText || ''}`)
    ),
    ...(savedItems.length ? ['saved'] : []),
  ];
  const tagSet = new Set(activeTags);

  const personalized = mockFeedLibrary
    .map((card) => {
      const matchedTags = card.relatedTags.filter((tag) => tagSet.has(tag));
      const savedMatch = savedTitles.find((title) =>
        card.relatedTags.some((tag) => extractAwarenessTags(title).includes(tag))
      );

      let reasonLabel = 'Starter awareness update';
      if (savedMatch) reasonLabel = `Because you saved ${savedMatch}`;
      else if (matchedTags.includes('zinc')) reasonLabel = 'Because you scanned zinc';
      else if (matchedTags.includes('magnesium')) reasonLabel = 'Because you scanned magnesium';
      else if (matchedTags.includes('otc')) reasonLabel = 'Based on OTC scan activity';
      else if (behavior.searches.length && matchedTags.length) reasonLabel = 'Based on recent searches';
      else if (matchedTags.length) reasonLabel = `Because of ${matchedTags[0]}`;

      return {
        ...card,
        reasonLabel,
        score: matchedTags.length + (savedMatch ? 3 : 0),
      };
    })
    .filter((card) => card.score > 0)
    .sort((a, b) => b.score - a.score);

  if (personalized.length >= 3) return personalized;

  const fallback = mockFeedLibrary
    .filter((card) => !personalized.some((item) => item.id === card.id))
    .slice(0, 3 - personalized.length)
    .map((card) => ({
      ...card,
      reasonLabel: 'Starter awareness update',
      score: 0,
    }));

  return [...personalized, ...fallback];
}

function getResultKey(result) {
  return String(result?.title || 'untitled').toLowerCase();
}

function getResultDescription(result) {
  return result?.sections?.[0]?.body || 'Saved label context for later review.';
}

function createLibraryItem(result, type = 'Scan') {
  return {
    id: getResultKey(result),
    title: result.title,
    type,
    description: getResultDescription(result),
    savedAtLabel: 'Saved today',
    result,
  };
}

function createRecentScanItem(result, index) {
  return {
    id: `${getResultKey(result)}-${index}`,
    title: result.title,
    subtitle: 'Scanned today',
    color: '#7E8B62',
    bottle: '#243329',
    result,
  };
}

const mockResultSummary = {
  title: 'Magnesium Glycinate',
  kicker: 'Label summary',
  neutralDisclaimer:
    'General information only. Ask a qualified professional for personal guidance.',
  longDisclaimer:
    'Educational context only. No diagnosis, treatment advice, safety labels, risk scoring, supplement recommendations, dosage suggestions, or medical advice.',
  sections: [
    {
      title: 'What it is',
      body: 'A form of magnesium paired with glycine. Magnesium is an essential mineral found in foods and supplements.',
    },
    {
      title: 'What people commonly use it for',
      body: 'People often look it up in connection with sleep routines, muscle function, and general wellness.',
    },
    {
      title: 'What sources say',
      body: 'Public health and research sources describe magnesium as involved in nerve, muscle, and metabolic functions. Evidence varies by use and person.',
    },
    {
      title: 'Questions to ask a professional',
      body: 'Ask whether it fits your health history, medications, dose limits, pregnancy status, kidney health, and other products you use.',
    },
  ],
};

function mapAnalysisToResultSummary(analysis) {
  return {
    title: analysis.product_name || mockResultSummary.title,
    kicker: 'Label summary',
    detectedLabelText: analysis.detected_label_text || '',
    neutralDisclaimer:
      analysis.neutral_disclaimer ||
      'This is general informational context. Ask a qualified professional for personal guidance.',
    longDisclaimer:
      'Educational context only. No diagnosis, treatment advice, safety labels, risk scoring, supplement recommendations, dosage suggestions, or medical advice.',
    sections: [
      {
        title: 'What it is',
        body: analysis.what_it_is || mockResultSummary.sections[0].body,
      },
      {
        title: 'What people commonly use it for',
        body: analysis.what_people_commonly_use_it_for || mockResultSummary.sections[1].body,
      },
      {
        title: 'What sources say',
        body: analysis.what_sources_say || mockResultSummary.sections[2].body,
      },
      {
        title: 'Questions to ask a professional',
        body: Array.isArray(analysis.questions_to_ask_a_professional)
          ? analysis.questions_to_ask_a_professional.join('\n')
          : mockResultSummary.sections[3].body,
      },
    ],
  };
}

async function analyzeLabelImage(photo) {
  if (!photo?.base64) {
    throw new Error('The captured image did not include base64 data. Please retake the photo.');
  }

  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LABEL_ANALYSIS_TIMEOUT_MS);

  try {
    response = await fetch(`${API_BASE_URL}/analyze-label`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: photo.base64,
        mimeType: 'image/jpeg',
      }),
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The label scan took too long after ${LABEL_ANALYSIS_TIMEOUT_MS / 1000} seconds.`);
    }

    throw new Error(`Fetch failed: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(
      `Backend returned ${response.status}: ${responseText || payload.error || 'No response body'}`
    );
  }

  return mapAnalysisToResultSummary(payload);
}

const libraryItems = [
  { id: 'magnesium', title: 'Magnesium Glycinate', body: 'Evidence summary' },
  { id: 'berberine', title: 'Berberine', body: 'Saved source context' },
  { id: 'sleep', title: 'Sleep support claims', body: 'Claim summary' },
];

const tabs = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'feed', label: 'Feed', icon: 'doc' },
  { key: 'quickScan', target: 'scan', label: '', icon: 'scan', center: true },
  { key: 'library', label: 'Library', icon: 'bookmark' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

const feedFilters = ['All', 'Updates', 'Trends', 'Saved Topics', 'Scans'];

function SplashScreen() {
  return (
    <SafeAreaView style={styles.splashScreen}>
      <StatusBar style="dark" />
      <View style={styles.splashMark}>
        <Text style={styles.splashLeaf}>W</Text>
      </View>
      <View style={styles.splashBrandRow}>
        <Text style={styles.splashBrand}>Wellumi</Text>
        <BrandLeaf style={styles.splashAccentLeaf} />
      </View>
      <Text style={styles.splashLine}>Make sense of what you're seeing.</Text>
    </SafeAreaView>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [query, setQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [currentResult, setCurrentResult] = useState(mockResultSummary);
  const [currentResultType, setCurrentResultType] = useState('Scan');
  const [activeFeedFilter, setActiveFeedFilter] = useState('All');
  const [behavior, setBehavior] = useState({
    scans: [],
    searches: [],
    savedItems: [],
  });

  const personalizedFeed = useMemo(() => buildFeedCards(behavior), [behavior]);
  const recentScanItems = useMemo(
    () => behavior.scans.map(createRecentScanItem),
    [behavior.scans]
  );
  const currentResultSaved = behavior.savedItems.some(
    (item) => item.id === getResultKey(currentResult)
  );

  function rememberResult(kind, result = mockResultSummary) {
    if (kind !== 'scan') return;

    setBehavior((current) => ({
      ...current,
      scans: [result, ...current.scans].slice(0, 6),
    }));
  }

  function rememberSearch(searchText) {
    const cleaned = String(searchText || '').trim();
    if (!cleaned) return;

    setBehavior((current) => ({
      ...current,
      searches: [cleaned, ...current.searches].slice(0, 8),
    }));
  }

  function saveCurrentResult() {
    setBehavior((current) => ({
      ...current,
      savedItems: current.savedItems.some((item) => item.id === getResultKey(currentResult))
        ? current.savedItems
        : [createLibraryItem(currentResult, currentResultType), ...current.savedItems].slice(0, 12),
    }));
  }

  function openResult(result = mockResultSummary, source = 'manual') {
    rememberResult(source, result);
    setCurrentResultType(source === 'scan' ? 'Scan' : source === 'search' ? 'Claim' : 'Topic');
    setCurrentResult(result);
    setShowResult(true);
  }

  const screen = useMemo(() => {
    if (showResult) {
      return (
        <ResultScreen
          result={currentResult}
          isSaved={currentResultSaved}
          onBack={() => setShowResult(false)}
          onSave={saveCurrentResult}
        />
      );
    }

    if (activeTab === 'scan') {
      return <ScanScreen onBack={() => setActiveTab('home')} onResult={(result) => openResult(result, 'scan')} />;
    }
    if (activeTab === 'search') {
      return (
        <SearchScreen
          query={query}
          setQuery={setQuery}
          onSearch={rememberSearch}
          onResult={() => openResult(mockResultSummary, 'search')}
        />
      );
    }
    if (activeTab === 'library') {
      return <LibraryScreen items={behavior.savedItems} onOpen={(item) => openResult(item.result, 'library')} />;
    }
    if (activeTab === 'feed') {
      return (
        <FeedScreen
          cards={personalizedFeed}
          activeFilter={activeFeedFilter}
          onFilter={setActiveFeedFilter}
          onOpen={() => openResult(mockResultSummary, 'feed')}
        />
      );
    }
    if (activeTab === 'profile') return <ProfileScreen />;

    return (
      <HomeScreen
        query={query}
        setQuery={setQuery}
        onTab={setActiveTab}
        onSearch={rememberSearch}
        onResult={(result) => openResult(result || mockResultSummary, 'search')}
        feedCards={personalizedFeed}
        recentScans={recentScanItems}
      />
    );
  }, [activeFeedFilter, activeTab, behavior.savedItems, currentResult, currentResultSaved, currentResultType, personalizedFeed, query, recentScanItems, showResult]);

  function handleTabPress(tab) {
    setActiveTab(tab);
    setShowResult(false);
  }

  const isCameraFlow = activeTab === 'scan' && !showResult;

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1250);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.content}>{screen}</View>
      {!isCameraFlow && <BottomTabs activeTab={activeTab} onTab={handleTabPress} />}
    </SafeAreaView>
  );
}

function HomeScreen({ query, setQuery, onTab, onSearch, onResult, feedCards, recentScans }) {
  function submitSearch() {
    onSearch(query);
    onResult();
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.homeScroll}>
      <View style={styles.topRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Good morning
          </Text>
          <View style={styles.brandRow}>
            <Text style={styles.heroBrand}>Wellumi</Text>
            <BrandLeaf style={styles.tinyLeaf} />
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.bellButton} accessibilityLabel="Notifications">
            <BellIcon />
            <View style={styles.notificationDot} />
          </Pressable>
          <Pressable style={styles.profileBubble} accessibilityLabel="Profile">
            <Icon name="profile" color={colors.greenDark} size={26} />
          </Pressable>
        </View>
      </View>

      <View style={styles.actionRow}>
        <ActionTile
          title="Scan label"
          body="Capture a product label"
          dark
          icon="scan"
          onPress={() => onTab('scan')}
        />
        <ActionTile
          title="Search claim"
          body="Look up an ingredient"
          icon="search"
          onPress={() => onTab('search')}
        />
        <ActionTile
          title="My library"
          body="View saved items"
          icon="book"
          onPress={() => onTab('library')}
        />
      </View>

      <SearchBox value={query} onChangeText={setQuery} onSubmit={submitSearch} />

      <SectionTitle title="Continue scans" action="See all" onAction={() => onTab('library')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.edgeCarousel}>
        {recentScans.length ? (
          recentScans.map((item) => (
            <ScanMiniCard key={item.id} item={item} onPress={() => onResult(item.result)} />
          ))
        ) : (
          <View style={styles.emptyMiniCard}>
            <Text style={styles.emptyMiniTitle}>No recent scans yet</Text>
            <Text style={styles.emptyMiniBody}>Scan a label to pick up where you left off.</Text>
          </View>
        )}
      </ScrollView>

      <SectionTitle title="Today's feed" action="See all" onAction={() => onTab('feed')} />
      {feedCards.slice(0, 3).map((card) => (
        <FeedCard key={card.id} card={card} onPress={onResult} />
      ))}
    </ScrollView>
  );
}

function ScanScreen({ onBack, onResult }) {
  const { width } = useWindowDimensions();
  const guideSize = Math.min(Math.max(width - 96, 180), 240);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  async function captureLabel() {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.42,
        skipProcessing: true,
        base64: true,
      });
      setPhoto(picture);
      setAnalysisError('');
    } finally {
      setIsCapturing(false);
    }
  }

  async function usePhoto() {
    if (!photo || isAnalyzing) return;

    console.log('[wellumi-debug] Use Photo tapped', {
      apiBaseUrl: API_BASE_URL,
      hasPhoto: Boolean(photo),
      hasBase64: Boolean(photo?.base64),
      base64Length: photo?.base64?.length || 0,
    });

    try {
      setIsAnalyzing(true);
      setAnalysisError('');
      const result = await analyzeLabelImage(photo);
      onResult(result);
    } catch (error) {
      const technicalMessage = error?.message || '';
      const fallbackMessage = technicalMessage.includes('took too long')
        ? 'The label scan took too long. Showing a mock summary for now.'
        : 'Wellumi could not read this label right now. Showing a mock summary for now.';
      const alertMessage = technicalMessage
        ? `${fallbackMessage}\n\nTechnical detail: ${technicalMessage}`
        : fallbackMessage;
      console.log('[wellumi-debug] Label analysis failed; using mock summary', {
        message: technicalMessage || fallbackMessage,
      });
      setAnalysisError(alertMessage);
      Alert.alert('Using mock summary', alertMessage);
      onResult(mockResultSummary);
    } finally {
      setIsAnalyzing(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.cameraShell}>
        <Pressable style={styles.cameraBackButton} onPress={onBack}>
          <Text style={styles.cameraBackText}>Back</Text>
        </Pressable>
        <View style={styles.permissionCard}>
          <Icon name="scan" color={colors.green} size={72} />
          <Text style={styles.permissionTitle}>Preparing camera</Text>
          <Text style={styles.permissionBody}>Wellumi is checking camera access for label capture.</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.cameraShell}>
        <Pressable style={styles.cameraBackButton} onPress={onBack}>
          <Text style={styles.cameraBackText}>Back</Text>
        </Pressable>
        <View style={styles.permissionCard}>
          <Icon name="scan" color={colors.green} size={72} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>Allow camera access to capture a supplement or OTC label.</Text>
          <PrimaryButton title="Allow Camera" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  if (photo) {
    return (
      <View style={styles.cameraShell}>
        <Pressable style={styles.cameraBackButton} onPress={onBack}>
          <Text style={styles.cameraBackText}>Back</Text>
        </Pressable>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Review label</Text>
          <Text style={styles.cameraSubtitle}>Confirm the label is readable before we summarize it.</Text>
        </View>
        <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        {!!analysisError && <Text style={styles.analysisError}>{analysisError}</Text>}
        <View style={styles.cameraActions}>
          <PrimaryButton title={isAnalyzing ? 'Reading label...' : 'Use photo'} onPress={usePhoto} disabled={isAnalyzing} />
          <SecondaryButton title="Retake" onPress={() => setPhoto(null)} disabled={isAnalyzing} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraShell}>
      <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back">
        <View style={styles.cameraOverlay}>
          <Pressable style={styles.cameraBackButtonDark} onPress={onBack}>
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
              <Text style={styles.captureButtonText}>{isCapturing ? 'Capturing...' : 'Capture label'}</Text>
            </Pressable>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

function SearchScreen({ query, setQuery, onSearch, onResult }) {
  function submitSearch(searchText = query) {
    onSearch(searchText);
    onResult();
  }

  return (
    <ScreenScroll>
      <ScreenHeader title="Search claim" subtitle="Find source-backed context for a product, ingredient, or claim." />
      <SearchBox value={query} onChangeText={setQuery} onSubmit={() => submitSearch()} />
      <SectionTitle title="Popular searches" />
      {libraryItems.map((item) => (
        <Pressable key={item.id} style={styles.listRow} onPress={() => submitSearch(item.title)}>
          <View style={styles.listRowCopy}>
            <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}
      <GuardrailNote />
    </ScreenScroll>
  );
}

function ResultScreen({ result, isSaved, onBack, onSave }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultScroll}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.resultHero}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{result.kicker || 'Label summary'}</Text>
        </View>
        <Text style={styles.resultTitle}>{result.title}</Text>
        <Text style={styles.resultBody}>
          {result.neutralDisclaimer ||
            'General information only. Ask a qualified professional for personal guidance.'}
        </Text>
      </View>
      {result.sections.map((section) => (
        <InfoCard key={section.title} title={section.title} body={section.body} />
      ))}
      {!!result.detectedLabelText && (
        <InfoCard compact title="Detected label text" body={result.detectedLabelText} />
      )}
      <InfoCard compact title="Important note" body={result.longDisclaimer || mockResultSummary.longDisclaimer} />
      <PrimaryButton title={isSaved ? 'Saved to library' : 'Save to library'} onPress={onSave} disabled={isSaved} />
      <GuardrailNote />
    </ScrollView>
  );
}

function LibraryScreen({ items, onOpen }) {
  return (
    <ScreenScroll>
      <ScreenHeader title="My library" subtitle="Saved scans, products, and topics." />
      {items.length ? (
        items.map((item) => (
          <Pressable key={item.id} style={styles.libraryCard} onPress={() => onOpen(item)}>
            <View style={styles.libraryTypeBadge}>
              <Text style={styles.libraryTypeText} numberOfLines={1}>{item.type}</Text>
            </View>
            <View style={styles.libraryText}>
              <Text style={styles.libraryTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.libraryDescription} numberOfLines={3}>{item.description}</Text>
              <Text style={styles.librarySavedAt}>{item.savedAtLabel}</Text>
            </View>
            <Icon name="bookmark" color={colors.green} size={22} />
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="Nothing saved yet"
          body="Save a scan or topic to build your Wellumi library."
        />
      )}
    </ScreenScroll>
  );
}

function FeedScreen({ cards, activeFilter, onFilter, onOpen }) {
  const visibleCards = activeFilter === 'All'
    ? cards
    : cards.filter((card) => card.filterType === activeFilter);

  return (
    <ScreenScroll>
      <ScreenHeader title="Awareness feed" subtitle="Updates based on your scans, searches, and saved topics." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {feedFilters.map((filter) => (
          <Pressable
            key={filter}
            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
            onPress={() => onFilter(filter)}
          >
            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]} numberOfLines={1}>
              {filter}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {visibleCards.length ? (
        visibleCards.map((card) => (
          <FeedCard key={card.id} card={card} onPress={onOpen} />
        ))
      ) : (
        <EmptyState
          title="No updates in this filter"
          body="Scan, search, or save topics to shape this awareness feed."
        />
      )}
      <GuardrailNote />
    </ScreenScroll>
  );
}

function ProfileScreen() {
  return (
    <ScreenScroll>
      <ScreenHeader title="Profile" subtitle="Your Wellumi settings and preferences." />
      <View style={styles.profileCard}>
        <View style={styles.profileSummaryRow}>
          <View style={styles.largeProfileBubble}>
            <Icon name="profile" color={colors.greenDark} size={32} />
          </View>
          <View style={styles.profileSummaryText}>
            <Text style={styles.profileName}>Wellumi member</Text>
            <Text style={styles.profileCaption}>Personalized on this device</Text>
          </View>
        </View>
      </View>
      <InfoCard title="Interests" body="Label literacy, saved topics, and source-backed context." />
      <InfoCard title="Preferences" body="Plain-language summaries with conservative wording." />
      <InfoCard title="Data & privacy" body="Your scans and saves stay on this device for now." />
    </ScreenScroll>
  );
}

function ActionTile({ title, body, icon, dark, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionTile,
        dark && styles.actionTileDark,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Icon name={icon} color={dark ? colors.white : colors.green} size={36} />
      <Text style={[styles.tileTitle, dark && styles.lightText]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.tileBody, dark && styles.lightBody]} numberOfLines={2}>
        {body}
      </Text>
    </Pressable>
  );
}

function SearchBox({ value, onChangeText, onSubmit }) {
  return (
    <View style={styles.searchWrap}>
      <Icon name="search" color={colors.muted} size={22} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search ingredient, product, or claim"
        placeholderTextColor={colors.mutedLight}
        returnKeyType="search"
        style={styles.searchInput}
      />
    </View>
  );
}

function ScanMiniCard({ item, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.scanMiniCard, pressed && styles.pressed]} onPress={onPress}>
      <ProductBottle item={item} />
      <View style={styles.scanMiniText}>
        <Text style={styles.scanMiniTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.scannedRow}>
          <View style={styles.scannedDot} />
          <Text style={styles.scannedText} numberOfLines={2}>
            {item.subtitle || 'Scanned'}
            {item.time ? ` · ${item.time}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ProductBottle({ item }) {
  return (
    <View style={styles.productPad}>
      <View style={[styles.bottleCap, { backgroundColor: item.color }]} />
      <View style={[styles.bottle, { backgroundColor: item.bottle }]}>
        <View style={[styles.bottleLabel, { backgroundColor: item.color }]} />
      </View>
    </View>
  );
}

function FeedCard({ card, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.feedCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.updateMarker}>
        <Text style={styles.updateMarkerText} numberOfLines={3}>{card.updateType}</Text>
      </View>
      <View style={styles.feedCopy}>
        <View style={styles.feedTopLine}>
          <Text style={styles.feedReason} numberOfLines={1}>{card.reasonLabel}</Text>
          <Text style={styles.feedDate} numberOfLines={1}>{card.date}</Text>
        </View>
        <Text style={styles.feedTitle} numberOfLines={2}>{card.title}</Text>
        <Text style={styles.feedBody} numberOfLines={2}>{card.summary || card.body}</Text>
        <View style={styles.feedFooter}>
          <View style={styles.feedPill}>
            <Icon name="doc" color={colors.green} size={14} />
            <Text style={styles.feedPillText} numberOfLines={1}>{card.sourceLabel}</Text>
          </View>
          <Text style={styles.feedCta} numberOfLines={1}>{card.cta} ›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ArticleArt({ palette, small }) {
  return (
    <View style={[styles.articleArt, small && styles.articleArtSmall, { backgroundColor: palette[1] }]}>
      <View style={[styles.artBlobOne, { backgroundColor: palette[0] }]} />
      <View style={[styles.artBlobTwo, { backgroundColor: palette[2] }]} />
      <View style={[styles.artLine, { backgroundColor: palette[0] }]} />
    </View>
  );
}

function InfoCard({ title, body, compact }) {
  return (
    <View style={[styles.infoCard, compact && styles.compactInfoCard]}>
      <Text style={[styles.cardTitle, compact && styles.compactCardTitle]}>{title}</Text>
      <Text style={[styles.cardBody, compact && styles.compactCardBody]}>{body}</Text>
    </View>
  );
}

function EmptyState({ title, body }) {
  return (
    <View style={styles.emptyStateCard}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateBody}>{body}</Text>
    </View>
  );
}

function ScreenHeader({ title, subtitle }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.screenSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function SectionTitle({ title, action, onAction }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8} disabled={!onAction}>
          <Text style={[styles.sectionAction, !onAction && styles.sectionActionMuted]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PrimaryButton({ title, onPress, disabled }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.primaryButtonText, disabled && styles.primaryButtonTextDisabled]}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress, disabled }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function GuardrailNote() {
  return (
    <View style={styles.guardrail}>
      <Text style={styles.guardrailTitle}>Educational use only</Text>
      <Text style={styles.guardrailText}>
        Wellumi does not provide diagnosis, treatment advice, safe or unsafe labels, risk scores, supplement recommendations, or medical advice.
      </Text>
    </View>
  );
}

function BottomTabs({ activeTab, onTab }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => {
        const target = tab.target || tab.key;
        const active = activeTab === target;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabItem, tab.center && styles.centerTabWrap]}
            onPress={() => onTab(target)}
          >
            <View style={[tab.center ? styles.centerTab : styles.tabIconWrap, active && !tab.center && styles.tabActive]}>
              <Icon name={tab.icon} color={tab.center ? colors.white : active ? colors.green : colors.tabInactive} size={tab.center ? 28 : 22} />
            </View>
            {!!tab.label && (
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function BellIcon() {
  return (
    <View style={styles.bellIcon}>
      <View style={styles.bellDome} />
      <View style={styles.bellBase} />
      <View style={styles.bellClapper} />
    </View>
  );
}

function Icon({ name, color, size }) {
  if (name === 'search') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={[styles.searchCircle, { borderColor: color, width: size * 0.62, height: size * 0.62, borderRadius: size }]} />
        <View style={[styles.searchHandle, { backgroundColor: color, width: size * 0.38, top: size * 0.62, left: size * 0.58 }]} />
      </View>
    );
  }

  if (name === 'scan') {
    const corner = size * 0.28;
    return (
      <View style={{ width: size, height: size }}>
        {['tl', 'tr', 'bl', 'br'].map((pos) => (
          <View
            key={pos}
            style={[
              styles.scanIconCorner,
              {
                borderColor: color,
                width: corner,
                height: corner,
                borderTopWidth: pos.includes('t') ? 4 : 0,
                borderBottomWidth: pos.includes('b') ? 4 : 0,
                borderLeftWidth: pos.includes('l') ? 4 : 0,
                borderRightWidth: pos.includes('r') ? 4 : 0,
                top: pos.includes('t') ? 0 : size - corner,
                left: pos.includes('l') ? 0 : size - corner,
              },
            ]}
          />
        ))}
        <View style={[styles.scanIconLine, { backgroundColor: color, top: size * 0.49, left: size * 0.2, width: size * 0.6 }]} />
      </View>
    );
  }

  if (name === 'book') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={[styles.bookPage, { borderColor: color, left: size * 0.08, width: size * 0.4, height: size * 0.7 }]} />
        <View style={[styles.bookPage, { borderColor: color, right: size * 0.08, width: size * 0.4, height: size * 0.7 }]} />
      </View>
    );
  }

  if (name === 'doc') {
    return (
      <View style={[styles.docIcon, { borderColor: color, width: size * 0.72, height: size, borderRadius: size * 0.08 }]}>
        <View style={[styles.docLine, { backgroundColor: color, width: size * 0.36 }]} />
        <View style={[styles.docLine, { backgroundColor: color, width: size * 0.28 }]} />
      </View>
    );
  }

  if (name === 'bookmark') {
    return <View style={[styles.bookmarkIcon, { borderColor: color, width: size * 0.62, height: size }]} />;
  }

  if (name === 'home') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={[styles.homeRoof, { borderBottomColor: color, left: size * 0.05, borderLeftWidth: size * 0.45, borderRightWidth: size * 0.45, borderBottomWidth: size * 0.38 }]} />
        <View style={[styles.homeBody, { backgroundColor: color, left: size * 0.18, top: size * 0.38, width: size * 0.64, height: size * 0.48 }]} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={[styles.profileHead, { backgroundColor: color, width: size * 0.34, height: size * 0.34, borderRadius: size }]} />
      <View style={[styles.profileBody, { backgroundColor: color, width: size * 0.62, height: size * 0.36, borderTopLeftRadius: size, borderTopRightRadius: size }]} />
    </View>
  );
}

const cardShadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 10,
  elevation: 3,
};

const cardBase = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.line,
  ...cardShadow,
};

function BrandLeaf({ style }) {
  return <View style={[styles.brandLeaf, style]} />;
}

function ScreenScroll({ children, style, contentStyle }) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.screenScroll, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.cream },
  content: { flex: 1 },
  brandLeaf: {
    width: 10,
    height: 18,
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: colors.greenMuted,
    transform: [{ rotate: '38deg' }],
  },
  splashScreen: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  splashMark: {
    width: 76,
    height: 76,
    borderRadius: radii.xxl,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg + 2,
  },
  splashLeaf: {
    color: colors.greenDark,
    fontSize: 36,
    fontWeight: '800',
  },
  splashBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splashBrand: {
    color: colors.greenDark,
    ...typography.displaySm,
  },
  splashAccentLeaf: {
    marginLeft: spacing.sm - 2,
    marginTop: -10,
  },
  splashLine: {
    color: colors.muted,
    ...typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  homeScroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: layout.screenPaddingTop,
    paddingBottom: layout.screenPaddingBottom,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  },
  screenScroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: layout.screenPaddingTop + spacing.sm,
    paddingBottom: layout.screenPaddingBottom,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  },
  resultScroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.sm,
    paddingBottom: layout.screenPaddingBottom + spacing.sm,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: layout.sectionGap,
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.sm,
  },
  heroTitle: {
    color: colors.greenDark,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  heroBrand: {
    color: colors.greenDark,
    ...typography.title,
  },
  tinyLeaf: {
    marginLeft: spacing.sm - 3,
    marginTop: -6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 3,
    flexShrink: 0,
    paddingTop: spacing.xs,
  },
  bellButton: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  notificationDot: {
    position: 'absolute',
    right: 2,
    top: 8,
    width: 11,
    height: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.cream,
  },
  profileBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: layout.sectionGap },
  actionTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 112,
    borderRadius: radii.lg - 2,
    ...cardBase,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  actionTileDark: { backgroundColor: colors.green, borderColor: colors.green },
  tileTitle: {
    color: colors.greenDark,
    ...typography.caption,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  tileBody: {
    color: colors.muted,
    ...typography.label,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  lightText: { color: colors.white },
  lightBody: { color: colors.heroText },
  searchWrap: {
    minHeight: 52,
    borderRadius: radii.lg,
    ...cardBase,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg - 1,
    marginBottom: layout.sectionGap + 2,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    marginLeft: spacing.md,
    color: colors.ink,
    ...typography.body,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  sectionHeading: {
    color: colors.greenDark,
    ...typography.title,
    flex: 1,
    minWidth: 0,
  },
  sectionAction: { color: colors.green, ...typography.caption, fontWeight: '700', flexShrink: 0 },
  sectionActionMuted: { color: colors.mutedLight },
  edgeCarousel: { marginHorizontal: -layout.screenPaddingX, paddingLeft: layout.screenPaddingX, paddingRight: layout.screenPaddingX, marginBottom: layout.sectionGap + spacing.xs },
  scanMiniCard: {
    width: 188,
    minHeight: 100,
    borderRadius: radii.md,
    ...cardBase,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md - 1,
    marginRight: spacing.md - 1,
  },
  productPad: {
    width: 52,
    height: 62,
    borderRadius: radii.sm,
    backgroundColor: '#F4F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md - 1,
    flexShrink: 0,
  },
  bottleCap: { width: 24, height: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  bottle: { width: 32, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bottleLabel: { width: 25, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.white },
  scanMiniText: { flex: 1, minWidth: 0 },
  scanMiniTitle: { color: colors.ink, ...typography.bodyStrong, fontSize: 14, lineHeight: 18 },
  scannedRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm - 1 },
  scannedDot: { width: 7, height: 7, borderRadius: radii.pill, backgroundColor: colors.green, marginRight: spacing.sm - 2, flexShrink: 0 },
  scannedText: { color: colors.muted, ...typography.label, fontWeight: '600', flex: 1 },
  emptyMiniCard: {
    width: 232,
    minHeight: 100,
    borderRadius: radii.lg - 2,
    ...cardBase,
    padding: spacing.lg - 2,
    marginRight: spacing.md - 1,
    justifyContent: 'center',
  },
  emptyMiniTitle: { color: colors.greenDark, ...typography.bodyStrong, fontWeight: '800' },
  emptyMiniBody: { color: colors.muted, ...typography.caption, marginTop: spacing.xs },
  feedCard: {
    borderRadius: radii.md,
    ...cardBase,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: spacing.md - 1,
    marginBottom: layout.cardGap,
    overflow: 'hidden',
  },
  updateMarker: {
    width: 68,
    borderRadius: radii.sm,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginRight: spacing.md,
    flexShrink: 0,
  },
  updateMarkerText: {
    color: colors.green,
    ...typography.micro,
    fontWeight: '800',
    textAlign: 'center',
  },
  articleArt: { width: 126, height: 112, borderRadius: 16, marginLeft: 4, overflow: 'hidden' },
  articleArtSmall: { width: 66, height: 66, marginLeft: 0, marginRight: 14 },
  artBlobOne: {
    position: 'absolute',
    width: 120,
    height: 64,
    borderRadius: 50,
    left: -14,
    top: 24,
    transform: [{ rotate: '-18deg' }],
  },
  artBlobTwo: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    right: -18,
    top: -18,
    opacity: 0.85,
  },
  artLine: {
    position: 'absolute',
    width: 150,
    height: 12,
    borderRadius: 12,
    left: -20,
    bottom: 20,
    opacity: 0.45,
    transform: [{ rotate: '12deg' }],
  },
  feedCopy: { flex: 1, minWidth: 0 },
  feedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  feedReason: {
    color: colors.green,
    ...typography.label,
    flex: 1,
    minWidth: 0,
  },
  feedDate: { color: colors.mutedLight, ...typography.micro, flexShrink: 0 },
  feedTitle: { color: colors.greenDark, ...typography.bodyStrong, fontSize: 16, lineHeight: 21 },
  feedBody: { color: colors.muted, ...typography.caption, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  feedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  feedPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
    gap: spacing.sm - 2,
  },
  feedPillText: { color: colors.green, ...typography.label, fontWeight: '700', flex: 1 },
  feedCta: { color: colors.green, ...typography.caption, fontWeight: '800', flexShrink: 0 },
  filterRow: { marginHorizontal: -layout.screenPaddingX, marginBottom: spacing.lg - 2 },
  filterRowContent: { paddingHorizontal: layout.screenPaddingX, gap: spacing.sm },
  filterChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  filterChipText: { color: colors.muted, ...typography.caption, fontWeight: '800' },
  filterChipTextActive: { color: colors.white },
  screenHeader: { marginBottom: layout.sectionGap - 2 },
  screenTitle: { color: colors.greenDark, ...typography.display },
  screenSubtitle: { color: colors.muted, ...typography.body, marginTop: spacing.sm - 2 },
  cameraShell: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  cameraHeader: {
    marginBottom: spacing.lg,
  },
  cameraTitle: {
    color: colors.greenDark,
    ...typography.display,
  },
  cameraSubtitle: {
    color: colors.muted,
    ...typography.body,
    marginTop: spacing.xs,
  },
  cameraPreview: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.greenDark,
    ...cardShadow,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg - 2,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  cameraBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm + 2,
    paddingRight: spacing.lg,
    marginBottom: spacing.sm + 2,
  },
  cameraBackText: {
    color: colors.green,
    ...typography.headline,
  },
  cameraBackButtonDark: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.34)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  cameraBackTextDark: {
    color: colors.white,
    ...typography.bodyStrong,
    fontWeight: '800',
  },
  cameraGuide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGuideCorner: {
    borderRadius: radii.xxl,
    borderWidth: 3,
    borderColor: colors.white,
    opacity: 0.92,
  },
  cameraGuideText: {
    color: colors.white,
    ...typography.headline,
    marginTop: spacing.lg,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    paddingHorizontal: spacing.xl,
  },
  capturePanel: {
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,253,248,0.96)',
    padding: spacing.md + 2,
    ...cardShadow,
  },
  captureButton: {
    minHeight: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonText: {
    color: colors.white,
    ...typography.button,
    fontSize: 17,
  },
  disabledButton: {
    opacity: 0.62,
  },
  permissionCard: {
    flex: 1,
    borderRadius: radii.xxl,
    ...cardBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  permissionTitle: {
    color: colors.greenDark,
    ...typography.displaySm,
    textAlign: 'center',
    marginTop: spacing.lg + 2,
  },
  permissionBody: {
    color: colors.muted,
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg + 2,
    maxWidth: 300,
  },
  photoPreview: {
    flex: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.greenDark,
    marginBottom: spacing.lg,
    ...cardShadow,
  },
  analysisError: {
    color: colors.greenDark,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.lg - 2,
    padding: spacing.md,
    ...typography.caption,
    marginBottom: spacing.md,
  },
  cameraActions: {
    gap: spacing.sm + 2,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: radii.lg - 2,
    ...cardBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.green,
    ...typography.button,
  },
  scanFrame: {
    minHeight: 330,
    borderRadius: 34,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginBottom: 16,
    ...cardShadow,
  },
  scanText: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', lineHeight: 31, textAlign: 'center', marginTop: 24 },
  scanFinePrint: { color: '#E8EFE5', fontSize: 16, marginTop: 8 },
  resultHero: {
    borderRadius: radii.lg,
    backgroundColor: colors.greenDark,
    padding: spacing.lg,
    marginBottom: layout.cardGap,
    ...cardShadow,
  },
  resultTitle: { color: colors.white, ...typography.displaySm, fontSize: 24, lineHeight: 30 },
  resultBody: { color: colors.heroText, ...typography.caption, marginTop: spacing.sm - 1 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.greenSoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: spacing.sm + 1,
    paddingVertical: spacing.xs + 1,
    marginBottom: spacing.md - 2,
  },
  pillText: {
    color: colors.green,
    ...typography.label,
    fontWeight: '800',
  },
  infoCard: {
    borderRadius: radii.md,
    ...cardBase,
    padding: spacing.md + 1,
    marginBottom: layout.cardGap,
  },
  compactInfoCard: {
    padding: spacing.md,
  },
  cardTitle: { color: colors.greenDark, ...typography.bodyStrong, fontSize: 16, lineHeight: 22 },
  cardBody: { color: colors.muted, ...typography.caption, marginTop: spacing.xs },
  compactCardTitle: { fontSize: 15, lineHeight: 20 },
  compactCardBody: { fontSize: 12, lineHeight: 17 },
  primaryButton: {
    minHeight: 52,
    borderRadius: radii.lg - 2,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
    ...cardShadow,
  },
  primaryButtonText: { color: colors.white, ...typography.button },
  primaryButtonTextDisabled: { color: colors.heroText },
  guardrail: {
    borderRadius: radii.lg - 2,
    backgroundColor: colors.surfaceWarm,
    padding: spacing.md + 1,
    marginTop: spacing.sm,
  },
  guardrailTitle: { color: colors.greenDark, ...typography.caption, fontWeight: '800' },
  guardrailText: { color: colors.muted, ...typography.caption, fontSize: 12, lineHeight: 18, marginTop: spacing.xs + 1 },
  listRow: {
    minHeight: 72,
    borderRadius: radii.lg - 2,
    ...cardBase,
    padding: spacing.md + 2,
    marginBottom: layout.cardGap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  listRowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.greenDark, ...typography.headline },
  rowBody: { color: colors.muted, ...typography.caption, marginTop: spacing.xs },
  arrow: { color: colors.green, fontSize: 26, flexShrink: 0 },
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingRight: spacing.md - 2, marginBottom: spacing.sm },
  backText: { color: colors.green, ...typography.headline },
  libraryCard: {
    minHeight: 88,
    borderRadius: radii.lg - 2,
    ...cardBase,
    padding: spacing.md + 1,
    marginBottom: layout.cardGap,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  libraryText: { flex: 1, minWidth: 0 },
  libraryTypeBadge: {
    maxWidth: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 2,
    alignItems: 'center',
    flexShrink: 0,
  },
  libraryTypeText: { color: colors.green, ...typography.label, fontWeight: '800' },
  libraryTitle: { color: colors.greenDark, ...typography.headline, fontSize: 18, lineHeight: 24 },
  libraryDescription: { color: colors.muted, ...typography.caption, marginTop: spacing.xs - 1 },
  librarySavedAt: { color: colors.green, ...typography.label, marginTop: spacing.sm - 2 },
  emptyStateCard: {
    borderRadius: radii.lg,
    ...cardBase,
    padding: spacing.xl,
  },
  emptyStateTitle: { color: colors.greenDark, ...typography.title },
  emptyStateBody: { color: colors.muted, ...typography.body, marginTop: spacing.sm - 2 },
  profileCard: {
    borderRadius: radii.lg - 2,
    ...cardBase,
    padding: spacing.lg,
    marginBottom: layout.cardGap,
  },
  largeProfileBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  profileSummaryText: { marginLeft: spacing.md - 2, flex: 1, minWidth: 0 },
  profileName: { color: colors.greenDark, ...typography.headline, fontSize: 20, lineHeight: 26 },
  profileCaption: { color: colors.muted, ...typography.caption, marginTop: spacing.xs },
  tabBar: {
    position: 'absolute',
    left: spacing.md + 2,
    right: spacing.md + 2,
    bottom: spacing.md,
    minHeight: 74,
    borderRadius: radii.xl,
    ...cardBase,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  tabItem: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  centerTabWrap: { marginTop: -30 },
  centerTab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.green,
    borderWidth: 4,
    borderColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  tabIconWrap: { height: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  tabActive: { transform: [{ scale: 1.03 }] },
  tabLabel: { color: colors.tabInactive, ...typography.micro, fontWeight: '600' },
  tabLabelActive: { color: colors.green, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  bellIcon: { width: 30, height: 34, alignItems: 'center' },
  bellDome: {
    width: 24,
    height: 24,
    borderWidth: 2.5,
    borderColor: colors.tabInactive,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomWidth: 0,
    marginTop: 2,
  },
  bellBase: { width: 30, height: 9, borderBottomWidth: 2.5, borderColor: colors.tabInactive, borderRadius: 8, marginTop: -4 },
  bellClapper: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tabInactive, marginTop: 1 },
  searchCircle: { position: 'absolute', left: 0, top: 0, borderWidth: 3 },
  searchHandle: { position: 'absolute', height: 3, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  scanIconCorner: { position: 'absolute', borderRadius: 5 },
  scanIconLine: { position: 'absolute', height: 4, borderRadius: 4 },
  bookPage: {
    position: 'absolute',
    top: 4,
    borderWidth: 3.5,
    borderRadius: 10,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  docIcon: { borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 4 },
  docLine: { height: 2, borderRadius: 2 },
  bookmarkIcon: { borderWidth: 2.5, borderBottomWidth: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  homeRoof: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  homeBody: { position: 'absolute', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  profileHead: { marginTop: 2 },
  profileBody: { marginTop: 4 },
});
