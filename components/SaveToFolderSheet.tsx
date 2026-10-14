/**
 * Bambu Handy "Collect to" folder picker with multi-select confirm.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { useBottomSheetScrollRef } from '@/components/ui/BottomSheetScrollContext';
import {
  Colors,
  FontFamily,
  FontWeight,
  Layout,
  Palette,
  Radius,
  Spacing,
  Typography,
} from '@/constants/BambuTheme';
import { useCrochetStore, type IdeaFolder } from '@/store/useCrochetStore';

type SaveToFolderSheetProps = {
  visible: boolean;
  patternId: string | null;
  onClose: () => void;
};

export function SaveToFolderSheet({ visible, patternId, onClose }: SaveToFolderSheetProps) {
  const collectionFolders = useCrochetStore((state) => state.collectionFolders);
  const togglePatternInFolders = useCrochetStore((state) => state.togglePatternInFolders);
  const createFolder = useCrochetStore((state) => state.createFolder);

  const savedFolderIds =
    patternId != null
      ? collectionFolders.filter((folder) => folder.patternIds.includes(patternId)).map((folder) => folder.id)
      : [];

  const [selectedIds, setSelectedIds] = useState<string[]>(savedFolderIds);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPrivate, setNewFolderPrivate] = useState(false);
  const sheetScrollRef = useBottomSheetScrollRef();
  const createBlockOffsetRef = useRef(0);

  useEffect(() => {
    if (visible && patternId) {
      setSelectedIds(savedFolderIds);
      setCreating(false);
      setNewFolderName('');
      setNewFolderPrivate(false);
    }
  }, [visible, patternId, savedFolderIds.join('|')]);

  const toggleSelected = (folderId: string) => {
    setSelectedIds((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );
  };

  const onCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const id = createFolder(name, newFolderPrivate);
    if (id) {
      setSelectedIds((current) => (current.includes(id) ? current : [...current, id]));
      setNewFolderName('');
      setNewFolderPrivate(false);
      setCreating(false);
      tick();
    }
  };

  const onConfirm = () => {
    if (!patternId) return;
    togglePatternInFolders(patternId, selectedIds);
    tick();
    onClose();
  };

  return (
    <BottomSheet
      visible={visible && patternId != null}
      onClose={onClose}
      sheetStyle={styles.sheet}
      handleStyle={styles.handle}
      header={
        <View style={styles.headerRow}>
          <Text role="heading" aria-level={2} style={styles.title}>Collect to</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New collection"
            onPress={() => {
              tick();
              setCreating((value) => !value);
            }}
            style={({ pressed }) => [pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.newAction}>+ New Collection</Text>
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm collection"
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      }
    >
      {patternId ? (
        <View style={styles.body}>
          {creating ? (
            <View
              style={styles.createBlock}
              onLayout={(event) => {
                createBlockOffsetRef.current = event.nativeEvent.layout.y;
              }}
            >
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Collection name"
                placeholderTextColor={Colors.textTertiary}
                selectionColor={Palette.handyGreen}
                autoFocus
                style={styles.createInput}
                onSubmitEditing={onCreateFolder}
                onFocus={() => {
                  sheetScrollRef?.current?.scrollTo({
                    y: Math.max(0, createBlockOffsetRef.current - Spacing.md),
                    animated: true,
                  });
                }}
              />
              <View style={styles.privateRow}>
                <Text style={styles.privateLabel}>Private</Text>
                <Switch
                  value={newFolderPrivate}
                  onValueChange={setNewFolderPrivate}
                  trackColor={{ false: Palette.checkboxBorder, true: Palette.handyGreen }}
                  thumbColor={Colors.textPrimary}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={onCreateFolder}
                style={({ pressed }) => [styles.createSave, pressed && styles.pressed, webCursor]}
              >
                <Text style={styles.createSaveText}>Add collection</Text>
              </Pressable>
            </View>
          ) : null}

          {collectionFolders.length === 0 ? (
            <Text style={styles.empty}>No collections yet — tap + New Collection.</Text>
          ) : (
            collectionFolders.map((folder) => (
              <FolderRow
                key={folder.id}
                folder={folder}
                selected={selectedIds.includes(folder.id)}
                onToggle={() => {
                  tick();
                  toggleSelected(folder.id);
                }}
              />
            ))
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function FolderRow({
  folder,
  selected,
  onToggle,
}: {
  folder: IdeaFolder;
  selected: boolean;
  onToggle: () => void;
}) {
  const count = folder.patternIds.length;
  const subtitle = `${count} ${count === 1 ? 'pattern' : 'patterns'}`;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={({ pressed }) => [styles.folderRow, pressed && styles.pressed, webCursor]}
    >
      <View style={styles.folderText}>
        <View style={styles.nameRow}>
          <Text style={styles.folderName}>{folder.name}</Text>
          {folder.isDefault ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          ) : null}
          {folder.isPrivate ? <LockClosedIcon /> : null}
        </View>
        <Text style={styles.folderMeta}>{subtitle}</Text>
      </View>
      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
        {selected ? <CheckIcon /> : null}
      </View>
    </Pressable>
  );
}

function CheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 12.5 L10 17 L18.5 7.5"
        stroke={Colors.textPrimary}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LockClosedIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={10} width={12} height={10} rx={2} stroke={Colors.textSecondary} strokeWidth={1.6} />
      <Path
        d="M8.5 10 V8 A3.5 3.5 0 0 1 15.5 8 V10"
        stroke={Colors.textSecondary}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Palette.sheetCharcoal,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: Palette.checkboxBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.medium,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  newAction: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
    color: Palette.handyGreen,
  },
  body: {
    paddingHorizontal: Layout.screenGutter,
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  createBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.backgroundPrimary,
  },
  createInput: {
    ...Typography.body,
    minHeight: 44,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.elevatedControl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privateLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  createSave: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Palette.handyGreen,
  },
  createSaveText: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  empty: {
    ...Typography.callout,
    color: Colors.textSecondary,
    paddingVertical: Spacing.lg,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  folderText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  folderName: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  defaultBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xs,
    backgroundColor: 'rgba(0, 174, 66, 0.18)',
  },
  defaultBadgeText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.semibold,
    color: Palette.handyGreen,
  },
  folderMeta: {
    ...Typography.caption,
    color: Palette.gray,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Palette.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.transparent,
  },
  checkboxOn: {
    borderColor: Palette.handyGreen,
    backgroundColor: Palette.handyGreen,
  },
  footer: {
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  confirmButton: {
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.handyGreen,
  },
  confirmText: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  pressed: {
    opacity: 0.72,
  },
});
