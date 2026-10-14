/**
 * Pick collection folders (and general library save) for a pattern.
 */
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { selectIsPatternCollected, useCrochetStore, type IdeaFolder } from '@/store/useCrochetStore';

type SaveToFolderSheetProps = {
  visible: boolean;
  patternId: string | null;
  onClose: () => void;
};

export function SaveToFolderSheet({ visible, patternId, onClose }: SaveToFolderSheetProps) {
  const collectionFolders = useCrochetStore((state) => state.collectionFolders);
  const togglePatternInFolder = useCrochetStore((state) => state.togglePatternInFolder);
  const toggleCollectPattern = useCrochetStore((state) => state.toggleCollectPattern);
  const createCollectionFolder = useCrochetStore((state) => state.createCollectionFolder);
  const collected = useCrochetStore((state) =>
    patternId != null ? selectIsPatternCollected(state, patternId) : false,
  );

  const savedFolderIds =
    patternId != null
      ? collectionFolders.filter((folder) => folder.patternIds.includes(patternId)).map((folder) => folder.id)
      : [];

  const [newFolderName, setNewFolderName] = useState('');

  const onCreateFolder = () => {
    if (!patternId) return;
    const name = newFolderName.trim();
    if (!name) return;
    const id = createCollectionFolder({ name });
    if (id) {
      togglePatternInFolder(id, patternId);
      setNewFolderName('');
    }
  };

  return (
    <BottomSheet
      visible={visible && patternId != null}
      onClose={onClose}
      header={
        <View style={styles.header}>
          <Text role="heading" aria-level={2} style={styles.title}>
            Save to folder
          </Text>
          <Text style={styles.subtitle}>Add this pattern to your library or a custom folder.</Text>
        </View>
      }
    >
      {patternId ? (
        <View style={styles.body}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: collected }}
            onPress={() => {
              tick();
              toggleCollectPattern(patternId);
            }}
            style={({ pressed }) => [styles.row, collected && styles.rowOn, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.rowTitle}>My collection</Text>
            <Text style={styles.rowMeta}>{collected ? 'Saved' : 'Not saved'}</Text>
          </Pressable>

          <View style={styles.newFolderRow}>
            <TextInput
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="New folder name"
              placeholderTextColor={Colors.textTertiary}
              selectionColor={Colors.accentPrimary}
              style={styles.newFolderInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new folder"
              onPress={onCreateFolder}
              style={({ pressed }) => [styles.newFolderButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.newFolderButtonText}>+ Create</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {collectionFolders.length === 0 ? (
              <Text style={styles.empty}>No folders yet — create one above.</Text>
            ) : (
              collectionFolders.map((folder) => (
                <FolderToggleRow
                  key={folder.id}
                  folder={folder}
                  selected={savedFolderIds.includes(folder.id)}
                  onToggle={() => togglePatternInFolder(folder.id, patternId)}
                />
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function FolderToggleRow({
  folder,
  selected,
  onToggle,
}: {
  folder: IdeaFolder;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        tick();
        onToggle();
      }}
      style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && styles.pressed, webCursor]}
    >
      <Text style={styles.rowTitle}>{folder.name}</Text>
      <Text style={styles.rowMeta}>
        {folder.patternIds.length} {folder.patternIds.length === 1 ? 'pattern' : 'patterns'}
      </Text>
    </Pressable>
  );
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.sm,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  body: {
    paddingHorizontal: Layout.screenGutter,
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  newFolderInput: {
    ...Typography.body,
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newFolderButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  newFolderButtonText: {
    ...Typography.caption,
    color: Colors.onAccent,
    fontWeight: FontWeight.bold,
  },
  list: {
    maxHeight: 320,
  },
  empty: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  rowOn: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  rowTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
    flex: 1,
  },
  rowMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  pressed: {
    opacity: 0.72,
  },
});
