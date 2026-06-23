import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

const INTERESTS = [
  { id: 'sleep', label: 'Better sleep' },
  { id: 'nutrition', label: 'Everyday nutrition' },
  { id: 'hydration', label: 'Hydration' },
  { id: 'stress', label: 'Stress and relaxation' },
  { id: 'movement', label: 'Movement and recovery' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'medicine_cabinet', label: 'Medicine cabinet' },
  { id: 'healthy_aging', label: 'Healthy aging' },
  { id: 'food_literacy', label: 'Food and ingredient literacy' },
  { id: 'trends', label: 'Wellness trends' },
  { id: 'herbal', label: 'Herbal and alternative wellness' },
  { id: 'safety', label: 'Product safety and recalls' },
];

const USE_CASES = [
  { id: 'understand_labels', label: 'Understand product labels' },
  { id: 'compare_ingredients', label: 'Compare ingredients' },
  { id: 'follow_trends', label: 'Follow wellness trends' },
  { id: 'track_products', label: 'Track products I use' },
  { id: 'decode_claims', label: 'Learn what claims really mean' },
  { id: 'safety_updates', label: 'Hear about recalls and safety updates' },
  { id: 'daily_habits', label: 'Build healthier daily habits' },
];

const BALANCE_CATEGORIES = [
  { id: 'everyday_guidance', label: 'Practical everyday guidance' },
  { id: 'ingredient_explainers', label: 'Product and ingredient explainers' },
  { id: 'trends', label: 'New products and trends' },
  { id: 'safety', label: 'Safety and recalls' },
  { id: 'evidence', label: 'Deeper evidence summaries' },
];

const LIMIT_TOPICS = [
  { id: 'weight_loss', label: 'Weight-loss content' },
  { id: 'alternative_wellness', label: 'Alternative wellness' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'otc_medication', label: 'OTC medication' },
  { id: 'product_trends', label: 'Product trends' },
  { id: 'technical_research', label: 'Technical research' },
];

const STEPS = ['welcome', 'interests', 'use_cases', 'balance', 'limits', 'account'];

function Chip({ label, selected, onPress, styles }) {
  return (
    <Pressable
      style={[styles.onboardingChip, selected && styles.onboardingChipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.onboardingChipText, selected && styles.onboardingChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function OnboardingScreen({
  styles,
  initialStep = 'welcome',
  draft,
  onSaveStep,
  onCompleteGuest,
  onCompleteEmail,
  onSignInExisting,
  loading,
  error,
}) {
  const [step, setStep] = useState(initialStep);
  const [selectedInterests, setSelectedInterests] = useState(draft?.selected_interests || []);
  const [selectedUseCases, setSelectedUseCases] = useState(draft?.selected_use_cases || []);
  const [contentBalance, setContentBalance] = useState(
    draft?.content_balance || {
      everyday_guidance: 'balanced',
      ingredient_explainers: 'balanced',
      trends: 'balanced',
      safety: 'balanced',
      evidence: 'balanced',
    }
  );
  const [limitedTopics, setLimitedTopics] = useState(draft?.limited_topics || []);
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStage, setEmailStage] = useState('enter');

  const preferences = useMemo(
    () => ({
      selected_interests: selectedInterests,
      selected_use_cases: selectedUseCases,
      content_balance: contentBalance,
      limited_topics: limitedTopics,
      preferred_feed_mix: {},
      notifications: {},
    }),
    [selectedInterests, selectedUseCases, contentBalance, limitedTopics]
  );

  function toggleValue(list, setList, id) {
    setList((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function goTo(nextStep) {
    await onSaveStep(step, preferences);
    setStep(nextStep);
  }

  return (
    <ScrollView contentContainerStyle={styles.onboardingScroll}>
      {step === 'welcome' ? (
        <View>
          <Text style={styles.onboardingTitle}>Make wellness products easier to understand</Text>
          <Text style={styles.onboardingBody}>
            Scan products, understand labels, follow useful wellness stories, receive relevant safety updates, and build a personal Library.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => goTo('interests')}>
            <Text style={styles.primaryButtonText}>Get started</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onSignInExisting}>
            <Text style={styles.secondaryButtonText}>I already have an account</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'interests' ? (
        <View>
          <Text style={styles.onboardingTitle}>What interests you?</Text>
          <Text style={styles.onboardingBody}>Choose at least two topics, or let Wellumi choose for you.</Text>
          <View style={styles.onboardingChipGrid}>
            {INTERESTS.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={selectedInterests.includes(item.id)}
                onPress={() => toggleValue(selectedInterests, setSelectedInterests, item.id)}
                styles={styles}
              />
            ))}
          </View>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setSelectedInterests(['sleep', 'nutrition', 'food_literacy']);
              goTo('use_cases');
            }}
          >
            <Text style={styles.secondaryButtonText}>Choose for me</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButton}
            disabled={selectedInterests.length < 2}
            onPress={() => goTo('use_cases')}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'use_cases' ? (
        <View>
          <Text style={styles.onboardingTitle}>How do you want to use Wellumi?</Text>
          <View style={styles.onboardingChipGrid}>
            {USE_CASES.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={selectedUseCases.includes(item.id)}
                onPress={() => toggleValue(selectedUseCases, setSelectedUseCases, item.id)}
                styles={styles}
              />
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={() => goTo('balance')}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'balance' ? (
        <View>
          <Text style={styles.onboardingTitle}>Shape your feed</Text>
          {BALANCE_CATEGORIES.map((item) => (
            <View key={item.id} style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>{item.label}</Text>
              <View style={styles.balanceOptions}>
                {['less', 'balanced', 'more'].map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.balancePill,
                      contentBalance[item.id] === level && styles.balancePillSelected,
                    ]}
                    onPress={() => setContentBalance((current) => ({ ...current, [item.id]: level }))}
                  >
                    <Text
                      style={[
                        styles.balancePillText,
                        contentBalance[item.id] === level && styles.balancePillTextSelected,
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Pressable style={styles.primaryButton} onPress={() => goTo('limits')}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'limits' ? (
        <View>
          <Text style={styles.onboardingTitle}>Topics to limit</Text>
          <Text style={styles.onboardingBody}>Optional. Wellumi will show less of what you limit.</Text>
          <View style={styles.onboardingChipGrid}>
            {LIMIT_TOPICS.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={limitedTopics.includes(item.id)}
                onPress={() => toggleValue(limitedTopics, setLimitedTopics, item.id)}
                styles={styles}
              />
            ))}
          </View>
          <Pressable style={styles.secondaryButton} onPress={() => setLimitedTopics([])}>
            <Text style={styles.secondaryButtonText}>No limits</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => goTo('account')}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'account' ? (
        <View>
          <Text style={styles.onboardingTitle}>Save your Wellumi</Text>
          <Text style={styles.onboardingBody}>
            Guest activity stays on this device. Email or Apple accounts can restore your Library and preferences across devices.
          </Text>
          <Pressable style={styles.primaryButton} disabled={loading} onPress={() => onCompleteGuest(preferences)}>
            <Text style={styles.primaryButtonText}>Continue as guest</Text>
          </Pressable>
          <View style={styles.emailBlock}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.emailInput}
            />
            {emailStage === 'verify' ? (
              <TextInput
                value={emailCode}
                onChangeText={setEmailCode}
                placeholder="One-time code"
                keyboardType="number-pad"
                style={styles.emailInput}
              />
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              disabled={loading || !email}
              onPress={() =>
                emailStage === 'enter'
                  ? onCompleteEmail({ email, stage: 'send' }).then(() => setEmailStage('verify'))
                  : onCompleteEmail({ email, code: emailCode, stage: 'verify', preferences })
              }
            >
              <Text style={styles.secondaryButtonText}>
                {emailStage === 'enter' ? 'Continue with email' : 'Verify code and continue'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.onboardingFinePrint}>
            Apple sign-in requires a development build. It is not verified from Expo Go alone.
          </Text>
        </View>
      ) : null}

      {!!error ? <Text style={styles.onboardingError}>{error}</Text> : null}
    </ScrollView>
  );
}
