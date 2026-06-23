import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export default function SignInScreen({
  styles,
  loading,
  error,
  guestUserId,
  onSendCode,
  onVerifyCode,
  onMergeGuest,
  onBack,
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('enter');
  const [handshake, setHandshake] = useState(null);
  const [signedInUserId, setSignedInUserId] = useState(null);
  const [localError, setLocalError] = useState('');

  async function handleSend() {
    setLocalError('');
    const nextHandshake = await onSendCode(email);
    setHandshake(nextHandshake);
    setStage('verify');
  }

  async function handleVerify({ mergeGuest = false } = {}) {
    setLocalError('');
    try {
      const result = await onVerifyCode({
        email,
        code,
        guestUserId: handshake?.guestUserId || guestUserId,
        migrationToken: handshake?.migrationToken,
        skipMigration: !mergeGuest,
      });
      setSignedInUserId(result.permanentUserId);
      if (!mergeGuest && result.guestUserId && result.guestUserId !== result.permanentUserId) {
        setStage('merge_prompt');
        return;
      }
      setStage('done');
    } catch (verifyError) {
      setLocalError(verifyError?.message || 'Could not verify email.');
      throw verifyError;
    }
  }

  async function handleMergeGuest() {
    setLocalError('');
    try {
      await onMergeGuest(handshake?.migrationToken);
      setStage('done');
    } catch (mergeError) {
      setLocalError(mergeError?.message || 'Could not merge guest activity.');
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
            disabled={loading || !email || (stage === 'verify' && !code)}
            onPress={() => (stage === 'enter' ? handleSend() : handleVerify({ mergeGuest: false }))}
          >
            <Text style={styles.primaryButtonText}>
              {stage === 'enter' ? 'Send code' : 'Verify and continue'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {stage === 'merge_prompt' ? (
        <View>
          <Text style={styles.onboardingBody}>
            This device has guest activity that is not part of your email account yet.
          </Text>
          <Pressable style={styles.primaryButton} disabled={loading} onPress={handleMergeGuest}>
            <Text style={styles.primaryButtonText}>Add this guest activity to my account</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} disabled={loading} onPress={() => setStage('done')}>
            <Text style={styles.secondaryButtonText}>Continue without merging</Text>
          </Pressable>
        </View>
      ) : null}

      {stage === 'done' ? (
        <View>
          <Text style={styles.onboardingBody}>
            Signed in successfully{signedInUserId ? ` as ${signedInUserId.slice(0, 8)}…` : ''}.
          </Text>
          <Pressable style={styles.primaryButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.secondaryButton} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>Back</Text>
      </Pressable>

      {!!(error || localError) ? <Text style={styles.onboardingError}>{error || localError}</Text> : null}
    </ScrollView>
  );
}
