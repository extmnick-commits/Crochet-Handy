/**
 * Save a tutorial from a link.
 *
 * The sheet only asks for the URL. YouTube details are read and checked
 * behind the scenes, while the logo animation plays, then the pattern is saved.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import LogoLaunch from '@/components/LogoLaunch';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useCrochetStore } from '@/store/useCrochetStore';
import { detectPatternVideo } from '@/utils/patternAiParser';
import { prepareTutorialImport, publishPreparedTutorial } from '@/utils/importTutorial';

type AddPatternModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (patternId: string) => void;
};

type Phase = 'link' | 'working' | 'done';

export function AddPatternModal({ visible, onClose, onSaved }: AddPatternModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      header={
        visible ? (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text role="heading" aria-level={2} style={styles.title}>
                New pattern
              </Text>
              <Text style={styles.subtitle}>Paste a tutorial link</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={Layout.hitSlop}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>
        ) : null
      }
    >
      {visible ? <AddPatternForm onClose={onClose} onSaved={onSaved} /> : null}
    </BottomSheet>
  );
}

function AddPatternForm({ onClose, onSaved }: { onClose: () => void; onSaved?: (patternId: string) => void }) {
  const addPatternFromYouTube = useCrochetStore((state) => state.addPatternFromYouTube);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('link');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onAdd = async () => {
    if (phase !== 'link') return;
    const detected = detectPatternVideo({ url });
    if (!detected) {
      setError('Paste a YouTube, Facebook, or web tutorial link.');
      return;
    }
    const library = useCrochetStore.getState().patterns;
    const existing = detected.videoId
      ? library.find((pattern) => pattern.videoId === detected.videoId)
      : library.find((pattern) => pattern.videoUrl === detected.videoUrl);
    if (existing) {
      setError(null);
      onSaved?.(existing.id);
      onClose();
      return;
    }

    setError(null);
    setPhase('working');
    const started = Date.now();
    const prepared = await prepareTutorialImport(url);
    const elapsed = Date.now() - started;
    if (elapsed < 900) await new Promise((resolve) => setTimeout(resolve, 900 - elapsed));
    if (!live.current) return;
    if (!prepared.ok) {
      setPhase('link');
      setError(prepared.message);
      return;
    }
    const id = addPatternFromYouTube(prepared.input);
    if (!id) {
      setPhase('link');
      setError('Could not save that pattern.');
      return;
    }
    await publishPreparedTutorial(prepared.community);
    onSaved?.(id);
    if (live.current) setPhase('done');
  };

  return (
    <View style={styles.form}>
      {phase === 'link' ? (
        <>
          <Text style={styles.label}>Tutorial link</Text>
          <TextInput
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setError(null);
            }}
            placeholder="YouTube, Facebook, or a blog video link"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            style={styles.input}
          />
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add pattern"
            onPress={() => {
              void onAdd();
            }}
            style={({ pressed }) => [styles.save, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.saveText}>Add pattern</Text>
          </Pressable>
        </>
      ) : (
        <View
          style={styles.stage}
          accessibilityRole="image"
          accessibilityLabel={phase === 'done' ? 'Pattern saved' : 'Reading this tutorial'}
        >
          <LogoLaunch active loop={phase === 'working'} onFinished={onClose} />
        </View>
      )}
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  closeGlyph: {
    marginTop: -2,
    color: Colors.textPrimary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: FontWeight.medium,
  },
  form: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
    minHeight: 48,
  },
  error: {
    ...Typography.caption,
    color: Colors.danger,
  },
  save: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  saveText: {
    ...Typography.body,
    color: Colors.onAccent,
    fontWeight: FontWeight.semibold,
  },
  stage: {
    height: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.72,
  },
});
