import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { ErrorState, LoadingState } from './components/StateViews';
import { useAuth } from './hooks/useAuth';
import { useProfile, PROFILE_STATES } from './hooks/useProfile';
import { useWellumiData } from './hooks/useWellumiData';
import FeedScreen, { FeedDetailScreen, openFeedSource } from './screens/FeedScreen';
import LibraryScreen from './screens/LibraryScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import SignInScreen from './screens/SignInScreen';
import ResultScreen from './screens/ResultScreen';
import ScanScreen from './screens/ScanScreen';
import { markFeedRead, saveProduct, submitStoryFeedback } from './services/api';
import {
  mergeGuestIntoCurrentAccount,
  sendEmailUpgradeCode,
  verifyEmailAndMigrate,
} from './services/accountTransition';
import { signOutAndReset } from './services/auth';
import { clearUserCache } from './services/userCache';
import { mapSavedProductToLibraryItem } from './services/mappers';
import { colors } from './theme/tokens';

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
  screenPaddingBottom: 148,
  sectionGap: spacing.xl,
  cardGap: spacing.md - 1,
  contentMaxWidth: 520,
};

const tabs = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'feed', label: 'Feed', icon: 'doc' },
  { key: 'quickScan', target: 'scan', label: '', icon: 'scan', center: true },
  { key: 'library', label: 'Library', icon: 'bookmark' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

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
  const auth = useAuth();
  const profileState = useProfile({ enabled: auth.status === 'ready', userId: auth.userId });
  const data = useWellumiData();
  const [activeTab, setActiveTab] = useState('home');
  const [showResult, setShowResult] = useState(false);
  const [showFeedDetail, setShowFeedDetail] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const [migrationHandshake, setMigrationHandshake] = useState(null);
  const [currentResult, setCurrentResult] = useState(null);
  const [currentFeedItem, setCurrentFeedItem] = useState(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');

  useEffect(() => {
    if (auth.status === 'ready' && auth.userId && !auth.authTransitioning) {
      data.hydrate();
    }
  }, [auth.status, auth.userId, auth.authTransitioning]);

  useEffect(() => {
    if (
      auth.status === 'ready' &&
      auth.userId &&
      profileState.isProfileResolved &&
      profileState.profile?.onboarding_status === 'not_started'
    ) {
      profileState.beginOnboarding().catch((error) => {
        if (__DEV__) console.log('[wellumi-onboarding] start failed', error?.message);
      });
    }
  }, [auth.status, auth.userId, profileState.isProfileResolved, profileState.profile?.onboarding_status]);

  const currentResultSaved = data.savedItems.some(
    (item) =>
      (currentResult?.analysisId && item.analysisId === currentResult.analysisId) ||
      (currentResult?.productId && item.productId === currentResult.productId)
  );

  function openResult(result) {
    if (!result) return;
    setCurrentResult(result);
    setShowResult(true);
    setShowFeedDetail(false);
  }

  async function saveCurrentResult() {
    if (!currentResult?.productId) {
      Alert.alert('Cannot save yet', 'This result is missing a saved product reference.');
      return;
    }

    try {
      const savedProduct = await saveProduct({
        productId: currentResult.productId,
        analysisId: currentResult.analysisId,
        scanId: currentResult.scanId,
      });
      const libraryItem = mapSavedProductToLibraryItem(savedProduct);
      data.setSavedItems((current) => [
        libraryItem,
        ...current.filter((item) => item.analysisId !== libraryItem.analysisId),
      ]);
    } catch (error) {
      Alert.alert('Could not save product', error?.message || 'Please try again.');
    }
  }

  async function handleFeedOpen(card) {
    setCurrentFeedItem(card);
    setShowFeedDetail(true);
    setShowResult(false);
    try {
      await markFeedRead(card.id);
    } catch (error) {
      if (__DEV__) console.log('[wellumi-feed] mark read failed', error?.message);
    }
  }

  const screen = useMemo(() => {
    if (showFeedDetail && currentFeedItem) {
      return (
        <FeedDetailScreen
          styles={styles}
          item={currentFeedItem}
          onBack={() => setShowFeedDetail(false)}
          onOpenSource={openFeedSource}
          onFeedback={async (feedbackType) => {
            try {
              await submitStoryFeedback(currentFeedItem.storyId, feedbackType, {
                storyCategory: currentFeedItem.storyCategory,
                topic: currentFeedItem.lifestyleCategory,
              });
              if (feedbackType === 'not_relevant' || feedbackType === 'less_like_this') {
                await data.reloadFeed();
              }
            } catch (error) {
              Alert.alert('Could not save feedback', error?.message || 'Please try again.');
            }
          }}
          GuardrailNote={GuardrailNote}
        />
      );
    }

    if (showResult && currentResult) {
      return (
        <ResultScreen
          styles={styles}
          InfoCard={InfoCard}
          PrimaryButton={PrimaryButton}
          GuardrailNote={GuardrailNote}
          result={currentResult}
          isSaved={currentResultSaved}
          onBack={() => setShowResult(false)}
          onSave={saveCurrentResult}
        />
      );
    }

    if (activeTab === 'scan') {
      return (
        <ScanScreen
          styles={styles}
          Icon={Icon}
          PrimaryButton={PrimaryButton}
          SecondaryButton={SecondaryButton}
          onBack={() => setActiveTab('home')}
          onResult={(result) => {
            openResult(result);
            data.hydrate();
          }}
        />
      );
    }

    if (activeTab === 'search') {
      return <SearchScreen styles={styles} ScreenHeader={ScreenHeader} />;
    }

    if (activeTab === 'library') {
      return (
        <LibraryScreen
          styles={styles}
          ScreenHeader={ScreenHeader}
          Icon={Icon}
          colors={colors}
          items={data.savedItems}
          loading={data.savedLoading}
          error={data.savedError}
          onRetry={data.hydrate}
          onOpen={(item) => openResult(item.result)}
        />
      );
    }

    if (activeTab === 'feed') {
      return (
        <FeedScreen
          styles={styles}
          ScreenHeader={ScreenHeader}
          FeedCard={FeedCard}
          cards={data.feedCards}
          loading={data.feedLoading}
          error={data.feedError}
          stale={data.feedStale}
          onRetry={data.hydrate}
          onRefresh={async () => {
            try {
              await data.reloadFeed();
            } catch (error) {
              Alert.alert('Feed refresh failed', error?.message || 'Please try again.');
            }
          }}
          onOpen={handleFeedOpen}
          GuardrailNote={GuardrailNote}
        />
      );
    }

    if (activeTab === 'profile') {
      return (
        <ProfileScreen
          styles={styles}
          ScreenHeader={ScreenHeader}
          InfoCard={InfoCard}
          Icon={Icon}
          scanCount={data.recentScans.length}
          savedCount={data.savedItems.length}
          feedCount={data.feedCards.length}
          userId={auth.userId}
          profile={profileState.profile}
          preferences={profileState.preferences}
          interestProfile={profileState.interestProfile}
          onUpgradeEmail={() => setShowSignIn(true)}
          onSignOut={async () => {
            const oldUserId = auth.userId;
            try {
              data.clear();
              profileState.reset();
              if (oldUserId) {
                await clearUserCache(oldUserId);
              }
              await signOutAndReset();
              await auth.refresh();
              await profileState.refresh();
              await data.hydrate();
            } catch (error) {
              Alert.alert('Could not sign out', error?.message || 'Please try again.');
            }
          }}
        />
      );
    }

    return (
      <HomeScreen
        styles={styles}
        onTab={setActiveTab}
        onResult={openResult}
        feedCards={data.feedCards}
        recentScans={data.recentScans}
        scansLoading={data.scansLoading}
        feedLoading={data.feedLoading}
        scansError={data.scansError}
        feedError={data.feedError}
        authError={auth.error}
        onRetryScans={data.hydrate}
        onRetryFeed={data.hydrate}
        onFeedOpen={handleFeedOpen}
        ActionTile={ActionTile}
        SectionTitle={SectionTitle}
        ScanMiniCard={ScanMiniCard}
        FeedCard={FeedCard}
        BrandLeaf={BrandLeaf}
        BellIcon={BellIcon}
        Icon={Icon}
      />
    );
  }, [
    activeTab,
    auth.error,
    auth.userId,
    currentFeedItem,
    currentResult,
    currentResultSaved,
    data,
    showFeedDetail,
    showResult,
  ]);

  function handleTabPress(tab) {
    setActiveTab(tab);
    setShowResult(false);
    setShowFeedDetail(false);
  }

  const isCameraFlow = activeTab === 'scan' && !showResult && !showFeedDetail;

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1250);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (auth.status === 'loading') {
    return (
      <SafeAreaView style={styles.app}>
        <LoadingState message="Starting your Wellumi session..." styles={styles} />
      </SafeAreaView>
    );
  }

  if (auth.authTransitioning) {
    return (
      <SafeAreaView style={styles.app}>
        <LoadingState message="Saving your Wellumi…" styles={styles} />
      </SafeAreaView>
    );
  }

  if (auth.status === 'error') {
    return (
      <SafeAreaView style={styles.app}>
        <ErrorState
          title="Could not start Wellumi"
          message={auth.error}
          onRetry={auth.retry}
          styles={styles}
        />
      </SafeAreaView>
    );
  }

  if (
    auth.status === 'ready' &&
    auth.userId &&
    (profileState.profileState === PROFILE_STATES.UNINITIALIZED ||
      profileState.profileState === PROFILE_STATES.LOADING)
  ) {
    return (
      <SafeAreaView style={styles.app}>
        <LoadingState message="Loading your profile..." styles={styles} />
      </SafeAreaView>
    );
  }

  if (showSignIn) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <SignInScreen
          styles={styles}
          loading={onboardingBusy}
          error={onboardingError}
          guestUserId={auth.userId}
          onSendCode={async (email) => {
            setOnboardingBusy(true);
            setOnboardingError('');
            try {
              auth.beginTransition();
              const handshake = await sendEmailUpgradeCode(email);
              setMigrationHandshake(handshake);
              return handshake;
            } catch (error) {
              setOnboardingError(error?.message || 'Could not send verification code.');
              auth.endTransition();
              throw error;
            } finally {
              setOnboardingBusy(false);
            }
          }}
          onVerifyCode={async (payload) => {
            setOnboardingBusy(true);
            setOnboardingError('');
            try {
              auth.beginTransition();
              data.clear();
              profileState.reset();
              const result = await verifyEmailAndMigrate(payload);
              await auth.refresh();
              await profileState.refresh();
              await data.hydrate();
              auth.endTransition();
              return result;
            } catch (error) {
              setOnboardingError(error?.message || 'Could not verify email.');
              auth.endTransition();
              throw error;
            } finally {
              setOnboardingBusy(false);
            }
          }}
          onMergeGuest={async (migrationToken) => {
            setOnboardingBusy(true);
            setOnboardingError('');
            try {
              auth.beginTransition();
              await mergeGuestIntoCurrentAccount(migrationToken);
              await auth.refresh();
              await profileState.refresh();
              await data.hydrate();
            } catch (error) {
              setOnboardingError(error?.message || 'Could not merge guest activity.');
              throw error;
            } finally {
              auth.endTransition();
              setOnboardingBusy(false);
            }
          }}
          onBack={() => {
            setShowSignIn(false);
            setOnboardingError('');
            auth.endTransition();
          }}
        />
      </SafeAreaView>
    );
  }

  if (auth.status === 'ready' && profileState.shouldShowOnboarding) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <OnboardingScreen
          styles={styles}
          initialStep={profileState.onboardingStep || 'welcome'}
          draft={profileState.preferences}
          loading={onboardingBusy}
          error={onboardingError}
          onSaveStep={async (step, draft) => {
            setOnboardingError('');
            await profileState.persistStep(step, draft);
          }}
          onCompleteGuest={async (preferences) => {
            try {
              setOnboardingBusy(true);
              setOnboardingError('');
              await profileState.finishOnboarding(preferences);
              await data.hydrate();
            } catch (error) {
              setOnboardingError(error?.message || 'Could not complete onboarding.');
            } finally {
              setOnboardingBusy(false);
            }
          }}
          onCompleteEmail={async ({ email, code, stage, preferences }) => {
            try {
              setOnboardingBusy(true);
              setOnboardingError('');
              if (stage === 'send') {
                auth.beginTransition();
                const handshake = await sendEmailUpgradeCode(email);
                setMigrationHandshake(handshake);
                auth.endTransition();
                return;
              }

              auth.beginTransition();
              data.clear();
              profileState.reset();

              const alreadyOnboarded = profileState.profile?.onboarding_status === 'completed';
              const migration = await verifyEmailAndMigrate({
                email,
                code,
                guestUserId: migrationHandshake?.guestUserId || auth.userId,
                migrationToken: migrationHandshake?.migrationToken,
              });

              await auth.refresh();

              if (!alreadyOnboarded) {
                await profileState.finishOnboarding(preferences);
              } else {
                await profileState.refresh();
              }

              await data.hydrate();
              auth.endTransition();
            } catch (error) {
              setOnboardingError(error?.message || 'Email verification failed.');
              auth.endTransition();
              throw error;
            } finally {
              setOnboardingBusy(false);
            }
          }}
          onSignInExisting={() => {
            setOnboardingError('');
            setShowSignIn(true);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.content}>{screen}</View>
      {!isCameraFlow && <BottomTabs activeTab={activeTab} onTab={handleTabPress} />}
    </SafeAreaView>
  );
}

function HomeScreen({
  styles,
  onTab,
  onResult,
  feedCards,
  recentScans,
  scansLoading,
  feedLoading,
  scansError,
  feedError,
  authError,
  onRetryScans,
  onRetryFeed,
  onFeedOpen,
  ActionTile,
  SectionTitle,
  ScanMiniCard,
  FeedCard,
  BrandLeaf,
  BellIcon,
  Icon,
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.homeScroll}>
      <View style={styles.topRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            Scan with confidence
          </Text>
          <View style={styles.brandRow}>
            <Text style={styles.heroBrand}>Wellumi</Text>
            <BrandLeaf style={styles.tinyLeaf} />
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.bellButton} accessibilityLabel="Notifications">
            <BellIcon />
          </Pressable>
          <Pressable style={styles.profileBubble} accessibilityLabel="Profile" onPress={() => onTab('profile')}>
            <Icon name="profile" color={colors.greenDark} size={26} />
          </Pressable>
        </View>
      </View>

      {!!authError && <Text style={styles.homeError}>{authError}</Text>}
      {scansLoading ? <Text style={styles.homeMeta}>Loading your recent scans...</Text> : null}
      {!!scansError && (
        <Pressable onPress={onRetryScans}>
          <Text style={styles.homeError}>{scansError} Tap to retry.</Text>
        </Pressable>
      )}

      <View style={styles.actionRow}>
        <ActionTile
          title="Scan a product"
          body="Barcode or label photo"
          dark
          icon="scan"
          onPress={() => onTab('scan')}
        />
        <ActionTile
          title="My library"
          body="Saved analyses"
          icon="book"
          onPress={() => onTab('library')}
        />
        <ActionTile
          title="Awareness feed"
          body="Real source updates"
          icon="doc"
          onPress={() => onTab('feed')}
        />
      </View>

      <SectionTitle title="Continue scans" action="See all" onAction={() => onTab('library')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.edgeCarousel}>
        {recentScans.length ? (
          recentScans.map((item) => (
            <ScanMiniCard key={item.id} item={item} onPress={() => onResult(item.result)} />
          ))
        ) : (
          <View style={styles.emptyMiniCard}>
            <Text style={styles.emptyMiniTitle}>No recent scans yet</Text>
            <Text style={styles.emptyMiniBody}>Scan a product to start building your history.</Text>
          </View>
        )}
      </ScrollView>

      <SectionTitle title="Your feed" action="See all" onAction={() => onTab('feed')} />
      {feedLoading ? <Text style={styles.homeMeta}>Loading your feed...</Text> : null}
      {!!feedError && (
        <Pressable onPress={onRetryFeed}>
          <Text style={styles.homeError}>{feedError} Tap to retry feed.</Text>
        </Pressable>
      )}
      {feedCards.slice(0, 3).map((card) => (
        <FeedCard key={card.id} card={card} onPress={() => onFeedOpen(card)} />
      ))}
      {!feedCards.length && !feedLoading && !feedError ? (
        <View style={styles.emptyMiniCard}>
          <Text style={styles.emptyMiniBody}>Scan a product to unlock personalized awareness updates.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function SearchScreen({ styles, ScreenHeader }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader
        title="Search"
        subtitle="Coming after the scan MVP. Use Scan to identify products with real data today."
      />
      <View style={styles.emptyStateCard}>
        <Text style={styles.emptyStateTitle}>Search is not available yet</Text>
        <Text style={styles.emptyStateBody}>
          Wellumi search will cover your scans, saved products, and catalog records in a later release.
        </Text>
      </View>
    </ScrollView>
  );
}

function ProfileScreen({
  styles,
  ScreenHeader,
  InfoCard,
  Icon,
  scanCount,
  savedCount,
  feedCount,
  userId,
  profile,
  preferences,
  interestProfile,
  onUpgradeEmail,
  onSignOut,
}) {
  const accountLabel =
    profile?.account_type === 'email'
      ? 'Email account'
      : profile?.account_type === 'apple'
        ? 'Apple account'
        : 'Guest account';

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="Profile" subtitle="Your Wellumi account, preferences, and learning summary." />
      <View style={styles.profileCard}>
        <View style={styles.profileSummaryRow}>
          <View style={styles.largeProfileBubble}>
            <Icon name="profile" color={colors.greenDark} size={32} />
          </View>
          <View style={styles.profileSummaryText}>
            <Text style={styles.profileName}>{profile?.display_name || 'Wellumi member'}</Text>
            <Text style={styles.profileCaption}>
              {accountLabel} · {scanCount} scans · {savedCount} saved · {feedCount} feed items
            </Text>
          </View>
        </View>
      </View>
      <InfoCard
        title="Selected interests"
        body={(preferences?.selected_interests || []).join(', ') || 'Complete onboarding to set interests.'}
      />
      <InfoCard
        title="Wellumi is learning from"
        body={
          (interestProfile?.topics || [])
            .slice(0, 4)
            .map((item) => item.sourceSummary?.[0] || item.topic)
            .join(' · ') || 'Your onboarding choices and product activity will appear here.'
        }
      />
      <InfoCard
        title="Data & privacy"
        body="Your scans, analyses, saved products, preferences, and feed matches are stored in Supabase. Guest activity is tied to this device identity until you upgrade."
      />
      {profile?.account_type === 'guest' ? (
        <Pressable style={styles.primaryButton} onPress={onUpgradeEmail}>
          <Text style={styles.primaryButtonText}>Save with email</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.secondaryButton} onPress={onSignOut}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>
      {__DEV__ && !!userId ? (
        <InfoCard title="Development user ID" body={userId} />
      ) : null}
    </ScrollView>
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
  const markerStyle = card.safetyFlag
    ? styles.feedMarkerSafety
    : card.isPersonalized
      ? styles.feedMarkerPersonalized
      : styles.feedMarkerGeneral;

  return (
    <Pressable style={({ pressed }) => [styles.feedCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.updateMarker, markerStyle]}>
        <Text style={[styles.updateMarkerText, card.safetyFlag && styles.updateMarkerTextSafety]} numberOfLines={4}>
          {card.safetyFlag ? 'Safety' : card.isPersonalized ? 'For you' : card.updateType}
        </Text>
      </View>
      <View style={styles.feedCopy}>
        <View style={styles.feedTopLine}>
          <Text style={styles.feedReason} numberOfLines={2}>{card.reasonLabel}</Text>
          <Text style={styles.feedDate} numberOfLines={1}>{card.date}</Text>
        </View>
        <Text style={styles.feedTitle} numberOfLines={3}>{card.title}</Text>
        <Text style={styles.feedBody} numberOfLines={3}>{card.summary || card.deck}</Text>
        <View style={styles.feedFooter}>
          <View style={styles.feedPill}>
            <Icon name="doc" color={colors.green} size={14} />
            <Text style={styles.feedPillText} numberOfLines={1}>{card.sourceLabel}</Text>
          </View>
          <Text style={styles.feedCta} numberOfLines={1}>Read story ›</Text>
        </View>
        {__DEV__ && !!card.generationMode ? (
          <Text style={styles.feedDevMeta}>
            generation_mode: {card.generationMode}
            {card.fallbackReason ? ` · ${card.fallbackReason}` : ''}
          </Text>
        ) : null}
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
  feedMarkerGeneral: {
    backgroundColor: colors.greenSoft,
  },
  feedMarkerPersonalized: {
    backgroundColor: '#E8F0E4',
  },
  feedMarkerSafety: {
    backgroundColor: '#F8E8E4',
  },
  updateMarkerTextSafety: {
    color: '#9A4D3D',
  },
  feedSafetyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8E8E4',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  feedSafetyBadgeText: {
    color: '#9A4D3D',
    ...typography.label,
  },
  feedReasonDetail: {
    color: colors.greenDark,
    ...typography.bodyStrong,
    marginTop: spacing.sm,
  },
  feedSourceLink: {
    color: colors.green,
    ...typography.body,
    marginBottom: spacing.sm,
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
  feedDevMeta: {
    color: colors.mutedLight,
    ...typography.micro,
    marginTop: spacing.xs,
  },
  feedFeedbackRow: { marginTop: spacing.sm, gap: spacing.sm },
  feedFeedbackAction: { color: colors.green, ...typography.caption, fontWeight: '700' },
  onboardingScroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: layout.screenPaddingTop,
    paddingBottom: layout.screenPaddingBottom,
    gap: spacing.lg,
  },
  onboardingTitle: { color: colors.greenDark, ...typography.displaySm, marginBottom: spacing.sm },
  onboardingBody: { color: colors.muted, ...typography.body, marginBottom: spacing.lg },
  onboardingChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  onboardingChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  onboardingChipSelected: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  onboardingChipText: { color: colors.greenDark, ...typography.caption },
  onboardingChipTextSelected: { color: colors.green, fontWeight: '800' },
  balanceRow: { marginBottom: spacing.md },
  balanceLabel: { color: colors.greenDark, ...typography.bodyStrong, marginBottom: spacing.sm },
  balanceOptions: { flexDirection: 'row', gap: spacing.sm },
  balancePill: {
    flex: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  balancePillSelected: { backgroundColor: colors.green, borderColor: colors.green },
  balancePillText: { color: colors.greenDark, ...typography.caption, textTransform: 'capitalize' },
  balancePillTextSelected: { color: colors.white, fontWeight: '800' },
  emailBlock: { marginTop: spacing.md },
  emailInput: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    color: colors.greenDark,
  },
  onboardingFinePrint: { color: colors.mutedLight, ...typography.caption, marginTop: spacing.md },
  onboardingError: { color: '#B42318', ...typography.caption, marginTop: spacing.md },
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
  homeError: { color: colors.danger, ...typography.caption, marginBottom: spacing.md },
  homeMeta: { color: colors.muted, ...typography.caption, marginBottom: spacing.md },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  stateTitle: { color: colors.greenDark, ...typography.headline, textAlign: 'center' },
  stateBody: { color: colors.muted, ...typography.body, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.green,
    borderRadius: radii.lg - 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryButtonText: { color: colors.white, ...typography.button },
  barcodeValue: {
    color: colors.greenDark,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  scanMetaText: { color: colors.green, ...typography.caption, marginTop: spacing.xs },
  resultMeta: { color: colors.heroText, ...typography.caption, marginTop: spacing.xs },
  resultImage: {
    width: '100%',
    height: 220,
    borderRadius: radii.lg,
    marginBottom: layout.cardGap,
    backgroundColor: colors.cardSoft,
  },
  resultSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  resultBadge: {
    color: colors.green,
    ...typography.micro,
    backgroundColor: colors.greenSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  resultSubsection: { marginTop: spacing.sm },
  resultSubheading: { color: colors.greenDark, ...typography.bodyStrong, marginBottom: spacing.xs },
  missingLine: { color: colors.mutedLight, ...typography.caption, fontStyle: 'italic' },
  feedRefreshButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.greenSoft,
  },
  feedRefreshText: { color: colors.green, ...typography.caption, fontWeight: '800' },
  feedStaleNote: {
    color: colors.muted,
    ...typography.caption,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
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
