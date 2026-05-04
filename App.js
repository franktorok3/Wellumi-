import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMemo, useRef, useState } from 'react';
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

const colors = {
  cream: '#FBF8F1',
  card: '#FFFDF8',
  cardSoft: '#F7F4EC',
  green: '#3F794D',
  greenDark: '#193D2B',
  greenSoft: '#EAF0E6',
  ink: '#16291F',
  muted: '#6E716D',
  line: '#E9E4DA',
  shadow: '#3A3328',
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

  try {
    response = await fetch(`${API_BASE_URL}/analyze-label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: photo.base64,
        mimeType: 'image/jpeg',
      }),
    });
  } catch (error) {
    throw new Error(`Fetch failed: ${error.message}`);
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

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [query, setQuery] = useState('');
  const [showResult, setShowResult] = useState(false);
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

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.content}>{screen}</View>
      {!isCameraFlow && <BottomTabs activeTab={activeTab} onTab={handleTabPress} />}
    </SafeAreaView>
  );
}

function HomeScreen({ query, setQuery, onTab, onSearch, onResult, feedCards, recentScans }) {
  const { width } = useWindowDimensions();
  const tileWidth = Math.max(96, (width - 62) / 3);

  function submitSearch() {
    onSearch(query);
    onResult();
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.homeScroll}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.heroTitle}>Good morning</Text>
          <View style={styles.brandRow}>
            <Text style={styles.heroBrand}>Wellumi</Text>
            <View style={styles.tinyLeaf} />
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.bellButton}>
            <BellIcon />
            <View style={styles.notificationDot} />
          </Pressable>
          <Pressable style={styles.profileBubble}>
            <Icon name="profile" color={colors.greenDark} size={28} />
          </Pressable>
        </View>
      </View>

      <View style={styles.actionRow}>
        <ActionTile
          width={tileWidth}
          title="Scan label"
          body="Get clarity in seconds"
          dark
          icon="scan"
          onPress={() => onTab('scan')}
        />
        <ActionTile
          width={tileWidth}
          title="Search claim"
          body="Understand what it means"
          icon="search"
          onPress={() => onTab('search')}
        />
        <ActionTile
          width={tileWidth}
          title="My library"
          body="Your saved insights"
          icon="book"
          onPress={() => onTab('library')}
        />
      </View>

      <SearchBox value={query} onChangeText={setQuery} onSubmit={submitSearch} />

      <SectionTitle title="Continue Scans" action="See all" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.edgeCarousel}>
        {recentScans.length ? (
          recentScans.map((item) => (
            <ScanMiniCard key={item.id} item={item} onPress={() => onResult(item.result)} />
          ))
        ) : (
          <View style={styles.emptyMiniCard}>
            <Text style={styles.emptyMiniTitle}>No recent scans yet.</Text>
            <Text style={styles.emptyMiniBody}>Scan a label to continue from here.</Text>
          </View>
        )}
      </ScrollView>

      <SectionTitle title="Today's Feed" action="See all" />
      {feedCards.slice(0, 3).map((card) => (
        <FeedCard key={card.id} card={card} onPress={onResult} />
      ))}
    </ScrollView>
  );
}

function ScanScreen({ onBack, onResult }) {
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
        quality: 0.85,
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
      const message =
        error?.message ||
        'Wellumi could not read this label right now. Showing a mock summary instead.';
      console.log('[wellumi-debug] Label analysis failed; using mock summary', {
        message,
      });
      setAnalysisError(`${message} Showing a mock summary instead.`);
      Alert.alert('Using mock summary', `${message} Showing a mock summary instead.`);
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
          <Text style={styles.cameraSubtitle}>Use this photo to read the label summary.</Text>
          <Text style={styles.debugLine}>Connecting to: {API_BASE_URL}</Text>
        </View>
        <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        {!!analysisError && <Text style={styles.analysisError}>{analysisError}</Text>}
        <View style={styles.cameraActions}>
          <PrimaryButton title={isAnalyzing ? 'Reading label...' : 'Use Photo'} onPress={usePhoto} disabled={isAnalyzing} />
          <Pressable style={styles.secondaryButton} onPress={() => setPhoto(null)} disabled={isAnalyzing}>
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </Pressable>
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
            <View style={styles.cameraGuideCorner} />
            <Text style={styles.cameraGuideText}>Frame the label clearly</Text>
          </View>
          <View style={styles.capturePanel}>
            <Text style={styles.debugLineLight}>Connecting to: {API_BASE_URL}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.captureButton,
                isCapturing && styles.disabledButton,
                pressed && styles.pressed,
              ]}
              onPress={captureLabel}
              disabled={isCapturing}
            >
              <Text style={styles.captureButtonText}>{isCapturing ? 'Capturing...' : 'Capture Label'}</Text>
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
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="Search claim" subtitle="Find source-backed context for a product, ingredient, or claim." />
      <SearchBox value={query} onChangeText={setQuery} onSubmit={() => submitSearch()} />
      <Text style={styles.sectionHeading}>Popular searches</Text>
      {libraryItems.map((item) => (
        <Pressable key={item.id} style={styles.listRow} onPress={() => submitSearch(item.title)}>
          <View>
            <Text style={styles.rowTitle}>{item.title}</Text>
            <Text style={styles.rowBody}>{item.body}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}
      <GuardrailNote />
    </ScrollView>
  );
}

function ResultScreen({ result, isSaved, onBack, onSave }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultScroll}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.resultHero}>
        <Text style={styles.pill}>{result.kicker || 'Label summary'}</Text>
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
      <PrimaryButton title={isSaved ? 'Saved' : 'Save to Library'} onPress={onSave} disabled={isSaved} />
      <GuardrailNote />
    </ScrollView>
  );
}

function LibraryScreen({ items, onOpen }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="My Library" subtitle="Saved scans, products, and topics." />
      {items.length ? (
        items.map((item) => (
          <Pressable key={item.id} style={styles.libraryCard} onPress={() => onOpen(item)}>
            <View style={styles.libraryTypeBadge}>
              <Text style={styles.libraryTypeText}>{item.type}</Text>
            </View>
            <View style={styles.libraryText}>
              <Text style={styles.libraryTitle}>{item.title}</Text>
              <Text style={styles.libraryDescription} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.librarySavedAt}>{item.savedAtLabel}</Text>
            </View>
            <Icon name="bookmark" color={colors.green} size={24} />
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>Nothing saved yet.</Text>
          <Text style={styles.emptyStateBody}>Save a scan or topic to build your Wellumi library.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function FeedScreen({ cards, activeFilter, onFilter, onOpen }) {
  const visibleCards = activeFilter === 'All'
    ? cards
    : cards.filter((card) => card.filterType === activeFilter);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="Awareness Feed" subtitle="Updates based on your scans, searches, and saved topics." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {feedFilters.map((filter) => (
          <Pressable
            key={filter}
            style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
            onPress={() => onFilter(filter)}
          >
            <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
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
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No updates in this filter yet.</Text>
          <Text style={styles.emptyStateBody}>Scan, search, or save topics to shape this awareness feed.</Text>
        </View>
      )}
      <GuardrailNote />
    </ScrollView>
  );
}

function ProfileScreen() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="Profile" subtitle="Your mock Wellumi settings and preferences." />
      <View style={styles.profileCard}>
        <View style={styles.largeProfileBubble}>
          <Icon name="profile" color={colors.greenDark} size={54} />
        </View>
        <Text style={styles.profileName}>Wellumi Explorer</Text>
        <Text style={styles.cardBody}>Saved topics, scan history, and source preferences live here in the MVP.</Text>
      </View>
      <InfoCard title="Source tone" body="Plain-language summaries with prompts for professional follow-up." />
      <InfoCard title="Privacy mode" body="Mock data only. No real product photos or health details are stored." />
    </ScrollView>
  );
}

function ActionTile({ width, title, body, icon, dark, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionTile,
        { width },
        dark && styles.actionTileDark,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Icon name={icon} color={dark ? '#FFFFFF' : colors.green} size={58} />
      <Text style={[styles.tileTitle, dark && styles.lightText]}>{title}</Text>
      <Text style={[styles.tileBody, dark && styles.lightBody]}>{body}</Text>
    </Pressable>
  );
}

function SearchBox({ value, onChangeText, onSubmit }) {
  return (
    <View style={styles.searchWrap}>
      <Icon name="search" color="#555B58" size={33} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Search ingredient, product, or claim"
        placeholderTextColor="#767B7A"
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
        <Text style={styles.scanMiniTitle}>{item.title}</Text>
        <View style={styles.scannedRow}>
          <View style={styles.scannedDot} />
          <Text style={styles.scannedText}>{item.subtitle || 'Scanned'}{item.time ? `\n${item.time}` : ''}</Text>
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
        <Text style={styles.updateMarkerText}>{card.updateType}</Text>
      </View>
      <View style={styles.feedCopy}>
        <View style={styles.feedTopLine}>
          <Text style={styles.feedReason} numberOfLines={1}>{card.reasonLabel}</Text>
          <Text style={styles.feedDate}>{card.date}</Text>
        </View>
        <Text style={styles.feedTitle}>{card.title}</Text>
        <Text style={styles.feedBody} numberOfLines={2}>{card.summary || card.body}</Text>
        <View style={styles.feedPill}>
          <Icon name="doc" color={colors.green} size={16} />
          <Text style={styles.feedPillText}>{card.sourceLabel}</Text>
        </View>
        <View style={styles.feedMetaRow}>
          <Text style={styles.feedTag}>{card.tag}</Text>
          <Text style={styles.feedCta}>{card.cta}</Text>
        </View>
      </View>
      <Text style={styles.feedArrow}>›</Text>
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

function ScreenHeader({ title, subtitle }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

function SectionTitle({ title, action }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <Text style={styles.sectionAction}>{action}</Text>
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
      <Text style={styles.primaryButtonText}>{title}</Text>
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
              <Icon name={tab.icon} color={tab.center ? '#FFFFFF' : active ? colors.green : '#5B6060'} size={tab.center ? 36 : 26} />
            </View>
            {!!tab.label && <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>}
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
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 5,
};

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.cream },
  content: { flex: 1 },
  homeScroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 164 },
  screenScroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 168 },
  resultScroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 176 },
  topRow: {
    position: 'relative',
    marginBottom: 20,
    minHeight: 104,
  },
  heroTitle: {
    color: colors.greenDark,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: 0,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginTop: -2 },
  heroBrand: {
    color: colors.greenDark,
    fontSize: 33,
    lineHeight: 37,
    fontWeight: '800',
    letterSpacing: 0,
  },
  tinyLeaf: {
    width: 10,
    height: 18,
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#B8C8AD',
    transform: [{ rotate: '38deg' }],
    marginLeft: 5,
    marginTop: -8,
  },
  headerActions: {
    position: 'absolute',
    right: 0,
    top: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  bellButton: { width: 38, height: 48, alignItems: 'center', justifyContent: 'center' },
  notificationDot: {
    position: 'absolute',
    right: 2,
    top: 9,
    width: 13,
    height: 13,
    borderRadius: 999,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.cream,
  },
  profileBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  actionTile: {
    minHeight: 124,
    borderRadius: 22,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    ...cardShadow,
  },
  actionTileDark: { backgroundColor: colors.green, borderColor: colors.green },
  tileTitle: {
    color: colors.greenDark,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 9,
  },
  tileBody: {
    color: colors.greenDark,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  lightText: { color: '#FFFFFF' },
  lightBody: { color: '#F3F6EE' },
  searchWrap: {
    minHeight: 62,
    borderRadius: 25,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    marginBottom: 24,
    ...cardShadow,
  },
  searchInput: { flex: 1, minHeight: 56, marginLeft: 13, color: colors.ink, fontSize: 18 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeading: { color: colors.greenDark, fontSize: 25, fontWeight: '800', letterSpacing: 0, flex: 1, paddingRight: 12 },
  sectionAction: { color: colors.green, fontSize: 16, fontWeight: '700', flexShrink: 0 },
  edgeCarousel: { marginHorizontal: -18, paddingLeft: 18, paddingRight: 18, marginBottom: 24 },
  scanMiniCard: {
    width: 196,
    minHeight: 116,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    marginRight: 13,
    ...cardShadow,
  },
  productPad: {
    width: 68,
    height: 80,
    borderRadius: 13,
    backgroundColor: '#F4F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  bottleCap: { width: 32, height: 10, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  bottle: { width: 42, height: 55, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottleLabel: { width: 34, height: 24, borderRadius: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  scanMiniText: { flex: 1 },
  scanMiniTitle: { color: '#0F1614', fontSize: 18, lineHeight: 21, fontWeight: '700' },
  scannedRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  scannedDot: { width: 11, height: 11, borderRadius: 999, backgroundColor: colors.green, marginTop: 4, marginRight: 8 },
  scannedText: { color: colors.muted, fontSize: 16, lineHeight: 18 },
  emptyMiniCard: {
    width: 220,
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginRight: 13,
    justifyContent: 'center',
  },
  emptyMiniTitle: { color: colors.greenDark, fontSize: 16, fontWeight: '800' },
  emptyMiniBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  feedCard: {
    minHeight: 118,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
    overflow: 'hidden',
    ...cardShadow,
  },
  updateMarker: {
    width: 72,
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 12,
  },
  updateMarkerText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 16,
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
  feedCopy: { flex: 1 },
  feedTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedReason: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginBottom: 3,
    flex: 1,
  },
  feedDate: { color: colors.muted, fontSize: 11, fontWeight: '800', marginBottom: 3 },
  feedTitle: { color: colors.greenDark, fontSize: 18, lineHeight: 22, fontWeight: '800' },
  feedBody: { color: '#6D6C6A', fontSize: 13, lineHeight: 18, marginTop: 3 },
  feedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.greenSoft,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 8,
    gap: 7,
  },
  feedPillText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  feedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
    gap: 8,
  },
  feedTag: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    flex: 1,
  },
  feedCta: { color: colors.green, fontSize: 12, fontWeight: '800' },
  filterRow: { marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 14 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  filterChipText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterChipTextActive: { color: '#FFFFFF' },
  feedArrow: { color: colors.green, fontSize: 28, fontWeight: '300', paddingLeft: 8 },
  screenHeader: { marginBottom: 22 },
  screenTitle: { color: colors.greenDark, fontSize: 42, lineHeight: 48, fontWeight: '800', letterSpacing: 0 },
  screenSubtitle: { color: colors.muted, fontSize: 18, lineHeight: 25, marginTop: 8 },
  cameraShell: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  cameraHeader: {
    marginBottom: 16,
  },
  cameraTitle: {
    color: colors.greenDark,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: 0,
  },
  cameraSubtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 4,
  },
  debugLine: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  debugLineLight: {
    color: colors.greenDark,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 8,
  },
  cameraPreview: {
    flex: 1,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: colors.greenDark,
    ...cardShadow,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  cameraBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingRight: 16,
    marginBottom: 10,
  },
  cameraBackText: {
    color: colors.green,
    fontSize: 17,
    fontWeight: '800',
  },
  cameraBackButtonDark: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.34)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cameraBackTextDark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cameraGuide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGuideCorner: {
    width: 230,
    height: 230,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    opacity: 0.92,
  },
  cameraGuideText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  capturePanel: {
    borderRadius: 26,
    backgroundColor: 'rgba(255,253,248,0.96)',
    padding: 14,
    ...cardShadow,
  },
  captureButton: {
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.62,
  },
  permissionCard: {
    flex: 1,
    borderRadius: 32,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    ...cardShadow,
  },
  permissionTitle: {
    color: colors.greenDark,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 18,
  },
  permissionBody: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  photoPreview: {
    flex: 1,
    borderRadius: 34,
    backgroundColor: colors.greenDark,
    marginBottom: 16,
    ...cardShadow,
  },
  analysisError: {
    color: colors.greenDark,
    backgroundColor: '#F1EBDD',
    borderRadius: 18,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cameraActions: {
    gap: 10,
  },
  secondaryButton: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '800',
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
  resultHero: { borderRadius: 24, backgroundColor: colors.greenDark, padding: 18, marginBottom: 12, ...cardShadow },
  resultTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', lineHeight: 33 },
  resultBody: { color: '#E7EFE6', fontSize: 14, lineHeight: 20, marginTop: 8 },
  pill: {
    alignSelf: 'flex-start',
    color: colors.green,
    backgroundColor: colors.greenSoft,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  infoCard: {
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    marginBottom: 10,
    ...cardShadow,
  },
  compactInfoCard: {
    padding: 12,
    marginBottom: 9,
  },
  cardTitle: { color: colors.greenDark, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  cardBody: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 },
  compactCardTitle: { fontSize: 15, lineHeight: 20 },
  compactCardBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  primaryButton: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    ...cardShadow,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  guardrail: { borderRadius: 18, backgroundColor: '#F1EBDD', padding: 13, marginTop: 8 },
  guardrailTitle: { color: colors.greenDark, fontSize: 14, fontWeight: '800' },
  guardrailText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  listRow: {
    minHeight: 84,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...cardShadow,
  },
  rowTitle: { color: colors.greenDark, fontSize: 20, fontWeight: '800' },
  rowBody: { color: colors.muted, fontSize: 15, marginTop: 4 },
  arrow: { color: colors.green, fontSize: 30, marginLeft: 14 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 },
  backText: { color: colors.green, fontSize: 17, fontWeight: '800' },
  libraryCard: {
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    ...cardShadow,
  },
  libraryText: { flex: 1 },
  libraryTypeBadge: {
    minWidth: 52,
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    marginRight: 12,
  },
  libraryTypeText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  libraryTitle: { color: colors.greenDark, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  libraryDescription: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  librarySavedAt: { color: colors.green, fontSize: 12, fontWeight: '800', marginTop: 6 },
  emptyStateCard: {
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    ...cardShadow,
  },
  emptyStateTitle: { color: colors.greenDark, fontSize: 22, fontWeight: '800' },
  emptyStateBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  profileCard: {
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
    ...cardShadow,
  },
  largeProfileBubble: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#EEF0E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  profileName: { color: colors.greenDark, fontSize: 26, fontWeight: '800' },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 13,
    minHeight: 86,
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    ...cardShadow,
  },
  tabItem: { flex: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center' },
  centerTabWrap: { marginTop: -43 },
  centerTab: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.green,
    borderWidth: 6,
    borderColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  tabIconWrap: { height: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tabActive: { transform: [{ scale: 1.04 }] },
  tabLabel: { color: '#5B6060', fontSize: 13, fontWeight: '500' },
  tabLabelActive: { color: colors.green, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  bellIcon: { width: 30, height: 34, alignItems: 'center' },
  bellDome: {
    width: 24,
    height: 24,
    borderWidth: 2.5,
    borderColor: '#5B6060',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomWidth: 0,
    marginTop: 2,
  },
  bellBase: { width: 30, height: 9, borderBottomWidth: 2.5, borderColor: '#5B6060', borderRadius: 8, marginTop: -4 },
  bellClapper: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5B6060', marginTop: 1 },
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
