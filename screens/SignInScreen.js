import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export default function SignInScreen({
  styles,
  sendingCode,
  verifying,
  merging,
  error,
  guestUserId,
  onSendCode,
  onVerifyCode,
  onFetchPreview,
  onMergeGuest,
  onSkipMerge,
  onBack,
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('enter');
  const [handshake, setHandshake] = useState(null);
  const [verifiedSession, setVerifiedSession] = useState(null);
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState('');

  const busy = sendingCode || verifying || merging;

  async function handleSend() {
    setLocalError('');
    try {
      const nextHandshake = await onSendCode(email);
      setHandshake(nextHandshake);
      setStage('verify');
    } catch (sendError) {
      setLocalError(sendError?.message || 'Could not send verification code.');
    }
  }

  async function handleVerify() {
    setLocalError('');
    try {
      const result = await onVerifyCode({
        email,
        code,
        guestUserId: handshake?.guestUserId || guestUserId,
        migrationToken: handshake?.migrationToken,
      });
      setVerifiedSession(result);
      if (result.needsMerge) {
        const nextPreview = await onFetchPreview(handshake?.migrationToken);
        setPreview(nextPreview);
        setStage('merge_prompt');
        return;
      }
      setStage('done');
    } catch (verifyError) {
      setLocalError(verifyError?.message || 'Could not verify email.');
    }
  }

  async function handleMergeGuest() {
    setLocalError('');
    try {
      await onMergeGuest({
        migrationToken: handshake?.migrationToken,
        guestUserId: verifiedSession?.guestUserId || handshake?.guestUserId || guestUserId,
      });
      setStage('done');
    } catch (mergeError) {
      setLocalError(mergeError?.message || 'Could not merge guest activity.');
    }
  }

  async function handleSkipMerge() {
    setLocalError('');
    try {
      await onSkipMerge(verifiedSession?.guestUserId || handshake?.guestUserId || guestUserId);
      setStage('done');
    } catch (skipError) {
      setLocalError(skipError?.message || 'Could not continue without merging.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.onboardingScroll}>
      <Text style={styles.onboardingTitle}>Sign in to your account</Text>
      <Text style={styles.onboardingBody}>
        Enter the email tied to your Wellumi account. We will send a one-time code.
      </Text>

      {stage === 'enter' || stage === 'verify' ? (
        <View>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.emailInput}
          />
          {stage === 'verify' ? (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="One-time code"
              keyboardType="number-pad"
              style={styles.emailInput}
            />
          ) : null}
          <Pressable
            style={styles.primaryButton}
            disabled={busy || !email || (stage === 'verify' && !code)}
            onPress={() => (stage === 'enter' ? handleSend() : handleVerify())}
          >
            <Text style={styles.primaryButtonText}>
              {stage === 'enter'
                ? sendingCode
                  ? 'Sending code...'
                  : 'Send code'
                : verifying
                  ? 'Verifying...'
                  : 'Verify and continue'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {stage === 'merge_prompt' ? (
        <View>
          <Text style={styles.onboardingTitle}>{preview?.headline || 'Add this guest activity to your account?'}</Text>
          {preview?.destination_summary ? (
            <Text style={styles.onboardingBody}>{preview.destination_summary}</Text>
          ) : null}
          {(preview?.lines || []).map((line) => (
            <Text key={line} style={styles.onboardingBody}>
              • {line}
            </Text>
          ))}
          <Pressable style={styles.primaryButton} disabled={busy} onPress={handleMergeGuest}>
            <Text style={styles.primaryButtonText}>{merging ? 'Adding activity...' : 'Add activity'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} disabled={busy} onPress={handleSkipMerge}>
            <Text style={styles.secondaryButtonText}>Continue without adding</Text>
          </Pressable>
        </View>
      ) : null}

      {stage === 'done' ? (
        <View>
          <Text style={styles.onboardingBody}>Signed in successfully.</Text>
          <Pressable style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.secondaryButton} onPress={onBack} disabled={busy}>
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>

      {!!(error || localError) ? <Text style={styles.onboardingError}>{error || localError}</Text> : null}
    </ScrollView>
  );
}
