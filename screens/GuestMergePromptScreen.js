import { Pressable, ScrollView, Text, View } from 'react-native';

export default function GuestMergePromptScreen({
  styles,
  preview,
  loading,
  error,
  onMerge,
  onSkip,
}) {
  return (
    <ScrollView contentContainerStyle={styles.onboardingScroll}>
      <Text style={styles.onboardingTitle}>{preview?.headline || 'Add this guest activity to your account?'}</Text>
      {preview?.destination_summary ? (
        <Text style={styles.onboardingBody}>{preview.destination_summary}</Text>
      ) : null}
      {(preview?.lines || []).map((line) => (
        <Text key={line} style={styles.onboardingBody}>
          • {line}
        </Text>
      ))}
      <Pressable style={styles.primaryButton} disabled={loading} onPress={onMerge}>
        <Text style={styles.primaryButtonText}>{loading ? 'Adding activity...' : 'Add activity'}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} disabled={loading} onPress={onSkip}>
        <Text style={styles.secondaryButtonText}>Continue without adding</Text>
      </Pressable>
      {!!error ? <Text style={styles.onboardingError}>{error}</Text> : null}
    </ScrollView>
  );
}
