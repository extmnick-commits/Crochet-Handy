/**
 * Dev-only controls on Me for previewing the upload paywall and seeding Firestore quota.
 */
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontWeight, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { DAILY_UPLOAD_LIMIT } from '@/store/machine';
import { useCrochetStore } from '@/store/useCrochetStore';
import { isFirebaseConfigured } from '@/utils/firebase';
import {
  resetDailyUploadLimitOnDevice,
  seedFirestoreUploadCap,
  simulateDailyUploadLimitOnDevice,
  uploadsRemainingToday,
} from '@/utils/uploadQuotaTesting';

export function UploadQuotaDevTools() {
  if (!__DEV__) return null;

  const account = useCrochetStore((state) => state.account);
  const remaining = uploadsRemainingToday(account);
  const tier = account?.membershipTier ?? 'none';

  return (
    <View style={styles.card} testID="upload-quota-dev-tools">
      <Text style={styles.title}>Upload quota (dev)</Text>
      <Text style={styles.meta}>
        Tier: {tier}
        {remaining != null ? ` · ${remaining}/${DAILY_UPLOAD_LIMIT} left today` : ' · Premium (no cap)'}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          testID="upload-quota-simulate-limit"
          onPress={() => simulateDailyUploadLimitOnDevice()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.buttonText}>Simulate limit (device)</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="upload-quota-reset"
          onPress={() => resetDailyUploadLimitOnDevice()}
          style={({ pressed }) => [styles.buttonSecondary, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.buttonSecondaryText}>Reset (device)</Text>
        </Pressable>
      </View>
      {isFirebaseConfigured() ? (
        <Pressable
          accessibilityRole="button"
          testID="upload-quota-seed-firestore"
          onPress={() => {
            void seedFirestoreUploadCap().then((result) => {
              if (result.limited || result.ok >= DAILY_UPLOAD_LIMIT) simulateDailyUploadLimitOnDevice();
            });
          }}
          style={({ pressed }) => [styles.buttonSecondary, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.buttonSecondaryText}>Use {DAILY_UPLOAD_LIMIT} slots in Firestore</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>Add Firebase env keys to burn real quota slots in Firestore.</Text>
      )}
      <Text style={styles.hint}>
        Open Patterns (+) or add yarn below after simulating to see the paywall. Deploy firestore.rules first for
        Firestore seeding.
      </Text>
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  meta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  button: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  buttonText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.semibold,
  },
  buttonSecondary: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonSecondaryText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  hint: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  pressed: {
    opacity: 0.72,
  },
});
