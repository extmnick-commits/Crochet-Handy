/**
 * Add a skein to the stash. The store normalizes the hex and rejects a blank
 * name, so this sheet checks both before calling `addStashItem`.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { UploadLimitPaywall } from '@/components/UploadLimitPaywall';
import { YarnColorSwatchPicker } from '@/components/YarnColorSwatchPicker';
import { YarnRegionSelector } from '@/components/YarnRegionSelector';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { MAX_SKEINS, YARN_WEIGHTS, useCrochetStore, type YarnWeight } from '@/store/useCrochetStore';
import { createId, decideUploadAccess, DAILY_UPLOAD_LIMIT, normalizeHex } from '@/store/machine';
import { isFirebaseConfigured } from '@/utils/firebase';
import { yarnWeightMeta } from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto, type CaptureSource } from '@/utils/progressPhoto';
import { hexToYarnColorName } from '@/utils/yarnColorExtractor';
import { regionSampleKey, type YarnSampleRegion } from '@/utils/yarnRegion';
import { reserveDailyUpload } from '@/utils/uploadQuota';
import { uploadsRemainingToday } from '@/utils/uploadQuotaTesting';

const PRESET_COLORS = [
  '#C6A36E',
  '#F3E6C8',
  '#4B3428',
  '#F0B7C4',
  '#D4A017',
  '#9CAF88',
  '#E8D5C4',
  '#1F4D3A',
  '#6B2D5B',
  '#2C3E6B',
  '#F4F1EA',
  '#1A1A1A',
] as const;

type AddYarnModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function AddYarnModal({ visible, onClose }: AddYarnModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      header={
        visible ? (
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text role="heading" aria-level={2} style={styles.title}>
                Add yarn to stash
              </Text>
              <Text style={styles.subtitle}>Track brand, color, and skeins on your shelf</Text>
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
      {visible ? (
        <AddYarnForm key="manual" onClose={onClose} />
      ) : null}
    </BottomSheet>
  );
}

function AddYarnForm({ onClose }: { onClose: () => void }) {
  const account = useCrochetStore((state) => state.account);
  const addStashItem = useCrochetStore((state) => state.addStashItem);
  const removeStashItem = useCrochetStore((state) => state.removeStashItem);
  const recordLocalUpload = useCrochetStore((state) => state.recordLocalUpload);
  const setUploadQuota = useCrochetStore((state) => state.setUploadQuota);
  const [colorName, setColorName] = useState('');
  const [brand, setBrand] = useState('');
  const [hex, setHex] = useState('#C6A36E');
  const [yarnWeight, setYarnWeight] = useState<YarnWeight>('worsted');
  const [skeinCount, setSkeinCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [yarnPhotoUri, setYarnPhotoUri] = useState<string | null>(null);
  const [yarnPhotoWidth, setYarnPhotoWidth] = useState(0);
  const [yarnPhotoHeight, setYarnPhotoHeight] = useState(0);
  const [yarnRegions, setYarnRegions] = useState<YarnSampleRegion[]>([]);
  const [yarnGeneration, setYarnGeneration] = useState(0);
  const [yarnSampledKey, setYarnSampledKey] = useState<string | null>(null);
  const [yarnColors, setYarnColors] = useState<{ name: string; hex: string }[]>([]);
  const yarnRegionSerial = useRef(0);
  const normalized = normalizeHex(hex);
  const uploadsLeft = uploadsRemainingToday(account);

  const persistYarn = async (draft: {
    hexColor: string;
    brand: string;
    colorName: string;
    yarnWeight: YarnWeight;
    skeinCount: number;
    hookSize?: string;
  }): Promise<'saved' | 'limit' | 'sign-in' | 'invalid' | 'error'> => {
    const hexColor = normalizeHex(draft.hexColor);
    if (!draft.colorName.trim() || !draft.brand.trim() || !hexColor) return 'invalid';
    const currentAccount = useCrochetStore.getState().account;
    const access = decideUploadAccess(currentAccount, isFirebaseConfigured(), Date.now());
    if (access === 'sign-in') return 'sign-in';
    if (access === 'limit') return 'limit';
    const docId = createId('yarn');
    const reserved = await reserveDailyUpload({
      kind: 'yarn',
      docId,
      brand: draft.brand.trim(),
      colorName: draft.colorName.trim(),
      hexColor,
      yarnWeight: draft.yarnWeight,
      skeinCount: draft.skeinCount,
    });
    if (reserved.status === 'limit') {
      if (reserved.quota) setUploadQuota(reserved.quota);
      return 'limit';
    }
    if (reserved.status === 'sign-in') return 'sign-in';
    if (reserved.status === 'error') return 'error';
    const id = addStashItem(
      {
        hexColor,
        brand: draft.brand.trim(),
        colorName: draft.colorName.trim(),
        yarnWeight: draft.yarnWeight,
        skeinCount: draft.skeinCount,
        hookSize: draft.hookSize,
      },
      docId,
    );
    if (!id || id !== docId) return 'error';
    if (reserved.status === 'server') setUploadQuota(reserved.quota);
    if (reserved.status === 'local' && currentAccount && !recordLocalUpload()) {
      removeStashItem(id);
      return 'limit';
    }
    return 'saved';
  };

  const onSave = async () => {
    const outcome = await persistYarn({
      hexColor: hex,
      brand,
      colorName,
      yarnWeight,
      skeinCount,
    });
    if (outcome === 'invalid') {
      setError(!normalized ? 'Use a hex color like #C6A36E.' : 'Add a brand and a color name.');
      return;
    }
    if (outcome === 'sign-in') {
      setError('Sign in to add yarn.');
      return;
    }
    if (outcome === 'limit') {
      setPaywall(true);
      return;
    }
    if (outcome === 'error') {
      setError('Could not add that yarn.');
      return;
    }
    onClose();
  };

  const onSnapYarn = async (source: CaptureSource) => {
    setError(null);
    const captured = await captureProgressPhoto(source);
    if (captured.status === 'canceled') return;
    if (captured.status === 'error') {
      setError(captureErrorMessage(captured.reason, source));
      return;
    }
    setYarnPhotoUri(captured.uri);
    setYarnPhotoWidth(0);
    setYarnPhotoHeight(0);
    setYarnRegions([]);
    setYarnSampledKey(null);
    setYarnColors([]);
    setYarnGeneration((value) => value + 1);
  };

  const applyYarnColor = (colors: { name: string; hex: string }[]) => {
    const primary = colors[0];
    if (!primary) return;
    setHex(primary.hex);
    setColorName(primary.name);
    setError(null);
  };

  if (paywall) {
    return (
      <View style={styles.form}>
        <UploadLimitPaywall onDismiss={() => setPaywall(false)} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {uploadsLeft != null ? (
        <Text style={styles.quotaHint} testID="yarn-uploads-remaining">
          {uploadsLeft} of {DAILY_UPLOAD_LIMIT} uploads left today (patterns + yarn).
        </Text>
      ) : null}

      <View style={styles.snapBlock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Snap Yarn Photo to Auto-Fill Color"
          testID="snap-yarn-photo"
          onPress={() => {
            void onSnapYarn('camera');
          }}
          style={({ pressed }) => [styles.snap, pressed && styles.pressed, webCursor]}
        >
          <CameraIcon color={Colors.accentPrimary} />
          <Text style={styles.snapText}>Snap Yarn Photo to Auto-Fill Color</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a yarn photo"
          onPress={() => {
            void onSnapYarn('library');
          }}
          style={({ pressed }) => [styles.choosePhoto, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.choosePhotoText}>Choose a photo</Text>
        </Pressable>
      </View>

      {yarnPhotoUri ? (
        <View style={styles.photoBlock}>
          <YarnRegionSelector
            imageUri={yarnPhotoUri}
            imageWidth={yarnPhotoWidth}
            imageHeight={yarnPhotoHeight}
            regions={yarnRegions}
            onImageSize={(width, height) => {
              setYarnPhotoWidth(width);
              setYarnPhotoHeight(height);
            }}
            onRegionsCommit={(regions) => {
              setYarnRegions(regions);
              setYarnColors([]);
              setYarnSampledKey(null);
            }}
            onCreateId={() => {
              yarnRegionSerial.current += 1;
              return `stash-${yarnGeneration}-${yarnRegionSerial.current}`;
            }}
          />
          {yarnRegions.length > 0 ? (
            <YarnColorSwatchPicker
              imageUri={yarnPhotoUri}
              imageWidth={yarnPhotoWidth}
              imageHeight={yarnPhotoHeight}
              regions={yarnRegions}
              photoGeneration={yarnGeneration}
              colors={yarnColors}
              sampledKey={yarnSampledKey}
              maxColors={1}
              onEditColors={(colors) => {
                setYarnColors(colors);
                setYarnSampledKey(regionSampleKey(yarnGeneration, yarnRegions));
                applyYarnColor(colors);
              }}
              onSampled={(stamp, colors) => {
                const key = regionSampleKey(yarnGeneration, yarnRegions);
                if (stamp.generation !== yarnGeneration || stamp.sampleKey !== key || yarnSampledKey === key) return;
                setYarnSampledKey(stamp.sampleKey);
                setYarnColors(colors);
                applyYarnColor(colors);
              }}
            />
          ) : null}
        </View>
      ) : null}

      <Field label="Color">
        <View style={styles.presets}>
          {PRESET_COLORS.map((color) => {
            const selected = normalized === color;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={color}
                accessibilityState={{ selected }}
                onPress={() => {
                  const named = hexToYarnColorName(color);
                  setHex(named.hex);
                  setColorName(named.name);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.preset,
                  { backgroundColor: color },
                  selected && styles.presetSelected,
                  pressed && styles.pressed,
                  webCursor,
                ]}
              />
            );
          })}
        </View>
        <TextInput
          value={hex}
          onChangeText={(value) => {
            setHex(value);
            setError(null);
          }}
          onBlur={() => {
            if (normalized) setHex(normalized);
          }}
          placeholder="#C6A36E"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
      </Field>

      <Field label="Color name">
        <TextInput
          value={colorName}
          onChangeText={(value) => {
            setColorName(value);
            setError(null);
          }}
          placeholder="Soft Fudge"
          placeholderTextColor={Colors.textTertiary}
          style={styles.input}
        />
      </Field>

      <Field label="Brand">
        <TextInput
          value={brand}
          onChangeText={(value) => {
            setBrand(value);
            setError(null);
          }}
          placeholder="Paintbox Yarns"
          placeholderTextColor={Colors.textTertiary}
          style={styles.input}
        />
      </Field>

      <Field label="Yarn weight">
        <View style={styles.chips}>
          {YARN_WEIGHTS.map((weight) => {
            const meta = yarnWeightMeta(weight);
            const selected = yarnWeight === weight;
            return (
              <Pressable
                key={weight}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setYarnWeight(weight)}
                style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {meta.label} {meta.number}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Skeins">
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fewer skeins"
            disabled={skeinCount <= 1}
            onPress={() => setSkeinCount((count) => Math.max(1, count - 1))}
            style={({ pressed }) => [styles.step, skeinCount <= 1 && styles.stepDisabled, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{skeinCount}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More skeins"
            disabled={skeinCount >= MAX_SKEINS}
            onPress={() => setSkeinCount((count) => Math.min(MAX_SKEINS, count + 1))}
            style={({ pressed }) => [styles.step, skeinCount >= MAX_SKEINS && styles.stepDisabled, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      </Field>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add yarn to stash"
        testID="add-yarn-save"
        onPress={() => {
          void onSave();
        }}
        style={({ pressed }) => [styles.save, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.saveText}>Add to stash</Text>
      </Pressable>
    </View>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5h3.1l1.2-2h7.4l1.2 2H20v10H4v-10Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="13.2" r="2.7" stroke={color} strokeWidth={1.6} />
    </Svg>
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
  field: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  quotaHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  snapBlock: {
    gap: Spacing.sm,
  },
  snap: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.md,
  },
  snapText: {
    ...Typography.label,
    flexShrink: 1,
    color: Colors.textPrimary,
  },
  choosePhoto: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xxs,
  },
  choosePhotoText: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  photoBlock: {
    gap: Spacing.sm,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
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
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  preset: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Colors.transparent,
  },
  presetSelected: {
    borderColor: Colors.accentPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  chipSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  chipTextSelected: {
    color: Colors.accentPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  stepDisabled: {
    opacity: 0.35,
  },
  stepText: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  stepValue: {
    ...Typography.subhead,
    minWidth: 24,
    textAlign: 'center',
    color: Colors.textPrimary,
  },
  error: {
    ...Typography.callout,
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
    ...Typography.label,
    color: Colors.onAccent,
  },
  pressed: {
    opacity: 0.72,
  },
});
