/**
 * Add a skein to the stash. The store normalizes the hex and rejects a blank
 * name, so this sheet checks both before calling `addStashItem`.
 */
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { MAX_SKEINS, YARN_WEIGHTS, useCrochetStore, type YarnWeight } from '@/store/useCrochetStore';
import { normalizeHex } from '@/store/machine';
import { yarnWeightMeta } from '@/utils/patternDisplay';

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
      {visible ? <AddYarnForm onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function AddYarnForm({ onClose }: { onClose: () => void }) {
  const addStashItem = useCrochetStore((state) => state.addStashItem);
  const [colorName, setColorName] = useState('');
  const [brand, setBrand] = useState('');
  const [hex, setHex] = useState('#C6A36E');
  const [yarnWeight, setYarnWeight] = useState<YarnWeight>('worsted');
  const [skeinCount, setSkeinCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeHex(hex);

  const onSave = () => {
    if (!colorName.trim() || !brand.trim()) {
      setError('Add a brand and a color name.');
      return;
    }
    if (!normalized) {
      setError('Use a hex color like #C6A36E.');
      return;
    }
    const id = addStashItem({
      hexColor: normalized,
      brand: brand.trim(),
      colorName: colorName.trim(),
      yarnWeight,
      skeinCount,
    });
    if (!id) {
      setError('Could not add that yarn.');
      return;
    }
    onClose();
  };

  return (
    <View style={styles.form}>
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
                  setHex(color);
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
        onPress={onSave}
        style={({ pressed }) => [styles.save, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.saveText}>Add to stash</Text>
      </Pressable>
    </View>
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
