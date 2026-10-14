/**
 * Shared email/password sign-in, account creation, and profile editing.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useCrochetStore, type UserAccount } from '@/store/useCrochetStore';
import { auth, isFirebaseConfigured } from '@/utils/firebase';
import { creatorInitials } from '@/utils/patternDisplay';

const AVATAR_SWATCHES = ['#2F6B4F', '#6B4A2F', '#2F4A6B', '#6B2F4A', '#4A6B2F', '#6B5A2F', '#2F6B6B'] as const;

export type AuthMode = 'sign-in' | 'create' | 'edit';
export type AuthFormLayout = 'sheet' | 'screen';

type AuthAccountFormProps = {
  initialMode: AuthMode;
  account: UserAccount | null;
  layout?: AuthFormLayout;
  bottomInset?: number;
  onSuccess: () => void;
};

export function AuthAccountForm({
  initialMode,
  account,
  layout = 'sheet',
  bottomInset = 0,
  onSuccess,
}: AuthAccountFormProps) {
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
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const [scrollOffsetY, setScrollOffsetY] = useState(0);

  const screenScrollRef = useRef<ScrollView>(null);
  const fieldOffsetsRef = useRef<Record<string, number>>({});

  const firebaseReady = isFirebaseConfigured();
  const isScreen = layout === 'screen';

  const registerFieldOffset = useCallback((key: string, event: LayoutChangeEvent) => {
    fieldOffsetsRef.current[key] = event.nativeEvent.layout.y;
  }, []);

  const scrollFieldIntoView = useCallback(
    (key: string) => {
      if (!isScreen) return;
      const y = fieldOffsetsRef.current[key];
      if (y == null) return;
      const keyboardInset = Keyboard.metrics()?.height ?? 0;
      const targetY = Math.max(0, y - Spacing.lg);
      requestAnimationFrame(() => {
        screenScrollRef.current?.scrollTo({ y: targetY, animated: true });
        if (keyboardInset > 0) {
          setTimeout(() => {
            screenScrollRef.current?.scrollTo({ y: targetY + Spacing.md, animated: true });
          }, Platform.OS === 'ios' ? 120 : 80);
        }
      });
    },
    [isScreen],
  );

  const scrollToPrimaryAction = useCallback(() => {
    if (!isScreen || scrollContentHeight <= scrollViewportHeight) return;
    screenScrollRef.current?.scrollTo({
      y: Math.max(0, scrollContentHeight - scrollViewportHeight),
      animated: true,
    });
  }, [isScreen, scrollContentHeight, scrollViewportHeight]);

  const scrollHintVisible =
    isScreen &&
    mode === 'create' &&
    scrollContentHeight > scrollViewportHeight + Spacing.sm &&
    scrollOffsetY < scrollContentHeight - scrollViewportHeight - Spacing.xl;

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
        onSuccess();
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
        onSuccess();
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
        onSuccess();
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
      onSuccess();
    } catch (caught) {
      setError(mapAuthError(caught));
    } finally {
      setBusy(false);
    }
  };

  const previewName = displayName.trim() || 'You';
  const switchLabel =
    mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in';

  const bodyContent = (
    <>
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
          <Field label="Email" layout={layout} onLayout={isScreen ? (e) => registerFieldOffset('email', e) : undefined}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => scrollFieldIntoView('email')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              inputMode="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={[styles.input, isScreen && styles.inputScreen]}
            />
          </Field>
          <Field label="Password" layout={layout} onLayout={isScreen ? (e) => registerFieldOffset('password', e) : undefined}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => scrollFieldIntoView('password')}
              secureTextEntry
              autoComplete={mode === 'create' ? 'new-password' : 'password'}
              textContentType={mode === 'create' ? 'newPassword' : 'password'}
              placeholder="••••••••"
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={[styles.input, isScreen && styles.inputScreen]}
            />
          </Field>
        </>
      )}

      {(mode === 'create' || mode === 'edit') && (
        <>
          <Field label="Display name" layout={layout} onLayout={isScreen ? (e) => registerFieldOffset('displayName', e) : undefined}>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              autoComplete="name"
              textContentType="name"
              placeholder="Your name"
              onFocus={() => scrollFieldIntoView('displayName')}
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={[styles.input, isScreen && styles.inputScreen]}
            />
          </Field>
          <Field label="Username" layout={layout} onLayout={isScreen ? (e) => registerFieldOffset('username', e) : undefined}>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              placeholder="your_handle"
              onFocus={() => scrollFieldIntoView('username')}
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={[styles.input, isScreen && styles.inputScreen]}
            />
          </Field>
          <Field label="Bio" layout={layout} onLayout={isScreen ? (e) => registerFieldOffset('bio', e) : undefined}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="What are you making?"
              onFocus={() => scrollFieldIntoView('bio')}
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              multiline
              style={[styles.input, styles.inputMultiline, isScreen && styles.inputScreen]}
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
    </>
  );

  const primaryLabel =
    busy ? 'Please wait…' : mode === 'edit' ? 'Save profile' : mode === 'create' ? 'Create account' : 'Sign in';

  const onScreenScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffsetY(event.nativeEvent.contentOffset.y);
  };

  if (isScreen) {
    return (
      <View
        style={styles.screenFormShell}
        onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)}
      >
        <ScrollView
          ref={screenScrollRef}
          style={styles.screenScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          onScroll={onScreenScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(_, height) => setScrollContentHeight(height)}
          contentContainerStyle={[styles.screenBody, { paddingBottom: Spacing.xxl + bottomInset }]}
        >
          {mode !== 'edit' && firebaseReady ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={switchLabel}
              onPress={() => {
                setError(null);
                setMode(mode === 'sign-in' ? 'create' : 'sign-in');
              }}
              style={({ pressed }) => [styles.screenModeSwitch, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.screenModeSwitchText}>{switchLabel}</Text>
            </Pressable>
          ) : null}
          {bodyContent}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            disabled={busy}
            onPress={() => void onSubmit()}
            style={({ pressed }) => [
              styles.primary,
              styles.primaryScreen,
              (pressed || busy) && styles.pressed,
              webCursor,
            ]}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
        </ScrollView>
        {scrollHintVisible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll down to Create account"
            onPress={scrollToPrimaryAction}
            style={({ pressed }) => [styles.scrollHint, pressed && styles.pressed, webCursor]}
          >
            <ChevronDownIcon color={Colors.accentPrimary} />
            <Text style={styles.scrollHintText}>Scroll for Create account</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
            <Text style={styles.switchMode}>{switchLabel}</Text>
          </Pressable>
        )}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {bodyContent}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        disabled={busy}
        onPress={() => void onSubmit()}
        style={({ pressed }) => [styles.primary, (pressed || busy) && styles.pressed, webCursor]}
      >
        <Text style={styles.primaryText}>{primaryLabel}</Text>
      </Pressable>
    </>
  );
}

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Field({
  label,
  children,
  layout,
  onLayout,
}: {
  label: string;
  children: ReactNode;
  layout: AuthFormLayout;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.field} onLayout={onLayout}>
      <Text style={[styles.label, layout === 'screen' && styles.labelScreen]}>{label}</Text>
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
  screenFormShell: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  screenScroll: {
    width: '100%',
    flex: 1,
  },
  scrollHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      web: { boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)' },
      default: {},
    }),
  },
  scrollHintText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  screenBody: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  screenModeSwitch: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  screenModeSwitchText: {
    ...Typography.callout,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
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
    width: '100%',
    gap: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  labelScreen: {
    ...Typography.callout,
    fontWeight: FontWeight.semibold,
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
  inputScreen: {
    minHeight: 52,
    fontSize: 17,
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
  primaryScreen: {
    marginHorizontal: 0,
    minHeight: 56,
    borderRadius: Radius.lg,
  },
  primaryText: {
    ...Typography.label,
    color: Colors.onAccent,
    fontSize: 17,
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
