/**
 * Email/password sign-in, account creation, and profile editing.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useCrochetStore, type UserAccount } from '@/store/useCrochetStore';
import { auth, isFirebaseConfigured } from '@/utils/firebase';
import { creatorInitials } from '@/utils/patternDisplay';

const AVATAR_SWATCHES = ['#2F6B4F', '#6B4A2F', '#2F4A6B', '#6B2F4A', '#4A6B2F', '#6B5A2F', '#2F6B6B'] as const;

type AuthMode = 'sign-in' | 'create' | 'edit';

type AuthAccountModalProps = {
  visible: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
};

export function AuthAccountModal({ visible, initialMode = 'sign-in', onClose }: AuthAccountModalProps) {
  const account = useCrochetStore((state) => state.account);
  const formKey = visible ? `${initialMode}-${account?.uid ?? 'guest'}` : 'closed';

  return (
    <BottomSheet visible={visible} onClose={onClose} header={null} footer={null}>
      {visible ? (
        <AuthAccountForm key={formKey} initialMode={initialMode} account={account} onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

function AuthAccountForm({
  initialMode,
  account,
  onClose,
}: {
  initialMode: AuthMode;
  account: UserAccount | null;
  onClose: () => void;
}) {
  const setAccount = useCrochetStore((state) => state.setAccount);
  const updateAccountProfile = useCrochetStore((state) => state.updateAccountProfile);

  const [mode, setMode] = useState<AuthMode>(account ? 'edit' : initialMode);
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [username, setUsername] = useState(account?.username ?? '');
  const [bio, setBio] = useState(account?.bio ?? '');
  const [avatarColor, setAvatarColor] = useState<string>(account?.avatarColor ?? AVATAR_SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const firebaseReady = isFirebaseConfigured();

  const title = useMemo(() => {
    if (mode === 'edit') return 'Edit profile';
    if (mode === 'create') return 'Create account';
    return 'Sign in';
  }, [mode]);

  const onSubmit = async () => {
    setError(null);
    if (mode === 'edit') {
      if (!account) {
        setError('Sign in to edit your profile.');
        return;
      }
      const trimmedName = displayName.trim();
      const trimmedUser = username.trim();
      if (!trimmedName) {
        setError('Add a display name.');
        return;
      }
      if (trimmedUser.length < 2) {
        setError('Username needs at least 2 letters or numbers.');
        return;
      }
      setBusy(true);
      try {
        if (firebaseReady && auth?.currentUser) {
          await updateProfile(auth.currentUser, { displayName: trimmedName });
        }
        updateAccountProfile({
          displayName: trimmedName,
          username: trimmedUser,
          bio,
          avatarColor,
        });
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!firebaseReady || !auth) {
      if (mode === 'create') {
        const trimmedName = displayName.trim();
        const trimmedUser = username.trim();
        if (!trimmedName || trimmedUser.length < 2) {
          setError('Add a display name and username for your local profile.');
          return;
        }
        const local: UserAccount = {
          uid: `local-${Date.now()}`,
          email: email.trim() || 'local@crochet-handy.app',
          displayName: trimmedName,
          username: trimmedUser.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32),
          bio,
          avatarColor,
          updatedAt: Date.now(),
        };
        setAccount(local);
        onClose();
        return;
      }
      setError('Add Firebase keys to .env to sign in with email and sync to the cloud.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        onClose();
        return;
      }

      const trimmedName = displayName.trim();
      const trimmedUser = username.trim();
      if (!trimmedName || trimmedUser.length < 2) {
        setError('Add a display name and username.');
        setBusy(false);
        return;
      }
      const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      await updateProfile(credential.user, { displayName: trimmedName });
      const profile: UserAccount = {
        uid: credential.user.uid,
        email: trimmedEmail,
        displayName: trimmedName,
        username: trimmedUser.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32),
        bio,
        avatarColor,
        updatedAt: Date.now(),
      };
      setAccount(profile);
      onClose();
    } catch (caught) {
      setError(mapAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  const previewName = displayName.trim() || 'You';

  return (
    <>
      <View style={styles.header}>
        <Text role="heading" aria-level={2} style={styles.title}>
          {title}
        </Text>
        {mode !== 'edit' && firebaseReady && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setMode(mode === 'sign-in' ? 'create' : 'sign-in');
            }}
            style={({ pressed }) => [pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.switchMode}>
              {mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          {(mode === 'create' || mode === 'edit') && (
            <View style={styles.avatarPreview}>
              <View style={[styles.avatarCircle, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>{creatorInitials(previewName)}</Text>
              </View>
              <View style={styles.swatchRow}>
                {AVATAR_SWATCHES.map((hex) => {
                  const selected = hex === avatarColor;
                  return (
                    <Pressable
                      key={hex}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setAvatarColor(hex)}
                      style={({ pressed }) => [
                        styles.swatch,
                        { backgroundColor: hex },
                        selected && styles.swatchSelected,
                        pressed && styles.pressed,
                        webCursor,
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {mode !== 'edit' && (
            <>
              <Field label="Email">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accentPrimary}
                  style={styles.input}
                />
              </Field>
              <Field label="Password">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accentPrimary}
                  style={styles.input}
                />
              </Field>
            </>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <>
              <Field label="Display name">
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Nick"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accentPrimary}
                  style={styles.input}
                />
              </Field>
              <Field label="Username">
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="crochet_nick"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accentPrimary}
                  style={styles.input}
                />
              </Field>
              <Field label="Bio">
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="What are you making?"
                  placeholderTextColor={Colors.textTertiary}
                  selectionColor={Colors.accentPrimary}
                  multiline
                  style={[styles.input, styles.inputMultiline]}
                />
              </Field>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!firebaseReady && mode !== 'edit' ? (
            <Text style={styles.hint}>
              Firebase is not configured yet. You can still create a local profile, or add EXPO_PUBLIC_FIREBASE_* keys to
              enable cloud backup.
            </Text>
          ) : null}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'edit' ? 'Save profile' : mode === 'create' ? 'Create account' : 'Sign in'}
        disabled={busy}
        onPress={() => void onSubmit()}
        style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed, webCursor]}
      >
        <Text style={styles.primaryText}>
          {busy ? 'Please wait…' : mode === 'edit' ? 'Save profile' : mode === 'create' ? 'Create account' : 'Sign in'}
        </Text>
      </Pressable>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function mapAuthError(caught: unknown): string {
  const code =
    typeof caught === 'object' && caught !== null && 'code' in caught ? String((caught as { code: string }).code) : '';
  if (code === 'auth/invalid-email') return 'That email address looks invalid.';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Wrong email or password.';
  if (code === 'auth/email-already-in-use') return 'An account already exists for that email.';
  if (code === 'auth/weak-password') return 'Choose a stronger password (at least 6 characters).';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again in a few minutes.';
  return 'Something went wrong. Check your connection and try again.';
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Layout.screenGutter,
    gap: Spacing.xs,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  switchMode: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  body: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  input: {
    ...Typography.body,
    minHeight: 48,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  error: {
    ...Typography.callout,
    color: Colors.danger,
  },
  hint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  primary: {
    marginHorizontal: Layout.screenGutter,
    minHeight: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  primaryText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  avatarPreview: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Colors.transparent,
  },
  swatchSelected: {
    borderColor: Colors.accentPrimary,
  },
  pressed: {
    opacity: 0.72,
  },
});
