/**
 * Active Project — the Bambu Handy "Devices" dashboard, retargeted at a make.
 *
 * The headline percent follows the row (28 of 40 reads 70%). Stitches stay on
 * the line under the bar. The timer reads the store's timestamps, so a locked
 * screen does not drift it.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { YouTubeEmbed } from '@/components/media/YouTubeEmbed';
import { ProjectIcon } from '@/components/navigation/TabIcons';
import { PhotoProgressModal } from '@/components/PhotoProgressModal';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyStateCard } from '@/components/ui/ScreenScaffold';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useProjectTimer } from '@/hooks/useProjectTimer';
import {
  isSlotEmpty,
  MAX_COUNT,
  selectActiveProject,
  selectCanUndo,
  useCrochetStore,
  YARN_WEIGHTS,
  type AmsSlotId,
  type AmsYarnSlot,
  type CrochetPattern,
  type CrochetProject,
} from '@/store/useCrochetStore';
import {
  formatHookMillimeters,
  formatHookSize,
  formatMillimeterHook,
  HOOK_SIZE_OPTIONS,
  hookLetterSize,
  parseHookMillimeters,
  yarnWeightMeta,
} from '@/utils/patternDisplay';
import { captureErrorMessage, captureProgressPhoto } from '@/utils/progressPhoto';
import { youtubeThumbnailUrl } from '@/utils/youtube';

export default function ActiveProjectScreen() {
  const insets = useSafeAreaInsets();
  const project = useCrochetStore(selectActiveProject);
  const projects = useCrochetStore((state) => state.projects);
  const pattern = useCrochetStore((state) => {
    const current = selectActiveProject(state);
    if (!current?.patternId) return null;
    return state.patterns.find((item) => item.id === current.patternId) ?? null;
  });
  const canUndo = useCrochetStore(selectCanUndo);
  const incrementStitch = useCrochetStore((state) => state.incrementStitch);
  const decrementStitch = useCrochetStore((state) => state.decrementStitch);
  const incrementRow = useCrochetStore((state) => state.incrementRow);
  const undoLastTap = useCrochetStore((state) => state.undoLastTap);
  const setActiveProject = useCrochetStore((state) => state.setActiveProject);
  const setHookAndYarn = useCrochetStore((state) => state.setHookAndYarn);
  const yarnStash = useCrochetStore((state) => state.yarnStash);
  const assignStashToSlot = useCrochetStore((state) => state.assignStashToSlot);
  const updateSlot = useCrochetStore((state) => state.updateSlot);
  const clearSlot = useCrochetStore((state) => state.clearSlot);
  const createProject = useCrochetStore((state) => state.createProject);
  const renameProject = useCrochetStore((state) => state.renameProject);
  const finishProject = useCrochetStore((state) => state.finishProject);
  const reopenProject = useCrochetStore((state) => state.reopenProject);
  const deleteProject = useCrochetStore((state) => state.deleteProject);
  const setTotalRows = useCrochetStore((state) => state.setTotalRows);
  const setStitchesPerRow = useCrochetStore((state) => state.setStitchesPerRow);

  const [autoAdvance, setAutoAdvance] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<AmsSlotId>('A1');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [toolingOpen, setToolingOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoView, setPhotoView] = useState<'log' | 'preview' | 'reel'>('log');
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const live = project?.status === 'in-progress';
  const statusLabel = project == null ? 'Idle' : live ? 'Active' : 'Finished';
  const videoId = pattern?.videoId ?? null;
  const slot = project?.slots.find((item) => item.id === selectedSlot) ?? project?.slots[0] ?? null;

  const onSnapshot = async () => {
    if (!project) return;
    tick('impact');
    setPhotoNotice(null);
    const source = Platform.OS === 'web' ? 'library' : 'camera';
    const result = await captureProgressPhoto(source);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      setDraftUri(null);
      setPhotoView('log');
      setPhotoNotice(captureErrorMessage(result.reason, source));
      setPhotoOpen(true);
      return;
    }
    setDraftUri(result.uri);
    setPhotoView('preview');
    setPhotoOpen(true);
  };

  const newNameClean = newName.replace(/\s+/g, ' ').trim();

  const closeSwitcher = () => {
    setSwitcherOpen(false);
    setCreating(false);
    setNewName('');
  };

  const onCreateProject = () => {
    if (!newNameClean) return;
    const id = createProject({ name: newNameClean });
    if (!id) return;
    tick('impact');
    setFullscreen(false);
    closeSwitcher();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text role="heading" aria-level={1} numberOfLines={1} style={styles.title}>
              {project?.name ?? 'Active Project'}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, live && styles.statusDotLive]} />
              <Text style={[styles.statusLabel, live && styles.statusLabelLive]}>{statusLabel}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch project"
            testID="project-switcher"
            hitSlop={Layout.hitSlop}
            onPress={() => {
              tick();
              setSwitcherOpen(true);
            }}
            style={({ pressed }) => [styles.switcher, pressed && styles.pressed, webCursor]}
          >
            <SwitcherIcon />
          </Pressable>
        </View>

        {project ? (
          <>
            <PlayerCard
              pattern={pattern}
              videoId={videoId}
              fullscreen={fullscreen}
              onOpenLog={() => {
                setDraftUri(null);
                setPhotoNotice(null);
                setPhotoView('log');
                setPhotoOpen(true);
              }}
              onSnapshot={() => void onSnapshot()}
              onFullscreen={() => {
                if (!videoId) return;
                tick();
                setFullscreen(true);
              }}
            />

            <ProgressCard
              key={project.id}
              project={project}
              pattern={pattern}
              canUndo={canUndo}
              autoAdvance={autoAdvance}
              onStitch={() => {
                tick('impact');
                incrementStitch(autoAdvance);
              }}
              onRow={() => {
                tick('impact');
                incrementRow();
              }}
              onUndo={() => {
                tick('impact');
                if (canUndo) undoLastTap();
                else decrementStitch();
              }}
              onFinish={() => {
                tick('impact');
                finishProject();
              }}
              onReopen={() => {
                tick('impact');
                reopenProject();
              }}
            />

            <View style={styles.section}>
              <Text role="heading" aria-level={2} style={styles.sectionTitle}>
                Device Control
              </Text>
              <View style={styles.bento}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Hook ${formatHookMillimeters(project.hookSize)}, yarn ${yarnWeightMeta(project.yarnWeight).label}. Tap for project setup.`}
                  testID="hook-yarn-card"
                  onPress={() => {
                    tick();
                    setToolingOpen(true);
                  }}
                  style={({ pressed }) => [styles.bentoTall, pressed && styles.pressed, webCursor]}
                >
                  <HookYarnBody project={project} />
                </Pressable>
                <View style={styles.bentoStack}>
                  <ProjectTimerCard />
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel="Auto-row advance"
                    accessibilityState={{ checked: autoAdvance }}
                    testID="auto-row-advance"
                    onPress={() => {
                      tick();
                      setAutoAdvance((value) => !value);
                    }}
                    style={({ pressed }) => [styles.bentoHalf, pressed && styles.pressed, webCursor]}
                  >
                    <View style={styles.autoRow}>
                      <View style={styles.autoCopy}>
                        <Text style={styles.cardKicker}>Auto-Row Advance</Text>
                        <Text style={[styles.autoState, autoAdvance && styles.autoStateOn]}>{autoAdvance ? 'On' : 'Off'}</Text>
                      </View>
                      <PillSwitch on={autoAdvance} />
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text role="heading" aria-level={2} style={styles.sectionTitle}>
                Yarn Palette (AMS-A)
              </Text>
              <View style={styles.ams}>
                <View style={styles.swatchRow}>
                  {project.slots.map((item) => {
                    const selected = item.id === (slot?.id ?? selectedSlot);
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${item.id}${item.colorName ? `, ${item.colorName}` : ', empty'}`}
                        testID={`yarn-slot-${item.id}`}
                        onPress={() => {
                          tick();
                          setSelectedSlot(item.id);
                        }}
                        style={({ pressed }) => [styles.swatch, { backgroundColor: item.hexColor }, selected && styles.swatchSelected, pressed && styles.pressed, webCursor]}
                      >
                        <View style={styles.swatchLabelBar}>
                          <Text style={styles.swatchLabel}>{item.id}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {slot ? (
                  <SlotDetail
                    slot={slot}
                    onLoad={() => {
                      tick();
                      setStashOpen(true);
                    }}
                    onStep={(delta) => {
                      tick('impact');
                      updateSlot(slot.id, { remainingPercent: clampPercent(slot.remainingPercent + delta) });
                    }}
                    onUnload={() => {
                      tick('impact');
                      clearSlot(slot.id);
                    }}
                  />
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <EmptyStateCard
            icon={<ProjectIcon focused color={Colors.accentPrimary} size={30} />}
            title="No project on the hook"
            body="Start a project from Patterns to track rows, stitches, and the tutorial on this dashboard."
          />
        )}
      </ScrollView>

      <BottomSheet
        visible={switcherOpen}
        onClose={closeSwitcher}
        header={<Text style={styles.sheetTitle}>Projects</Text>}
      >
        <View style={styles.sheetBody}>
          {creating ? (
            <View style={styles.newProjectForm}>
              <Text style={styles.cardKicker}>New Blank Project</Text>
              <TextInput
                autoFocus
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={onCreateProject}
                placeholder="Project name"
                placeholderTextColor={Colors.textTertiary}
                returnKeyType="done"
                maxLength={80}
                accessibilityLabel="New project name"
                testID="new-project-name"
                style={styles.input}
              />
              <View style={styles.newProjectActions}>
                <Pressable
                  accessibilityRole="button"
                  testID="new-project-cancel"
                  onPress={() => {
                    tick();
                    setCreating(false);
                    setNewName('');
                  }}
                  style={({ pressed }) => [styles.slotPill, pressed && styles.pressed, webCursor]}
                >
                  <Text style={styles.slotPillText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !newNameClean }}
                  disabled={!newNameClean}
                  testID="new-project-create"
                  onPress={onCreateProject}
                  style={({ pressed }) => [styles.slotPill, styles.slotPillPrimary, !newNameClean && styles.pillDisabled, pressed && styles.pressed, webCursor]}
                >
                  <Text style={[styles.slotPillText, styles.slotPillTextPrimary]}>Create</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              testID="new-project"
              onPress={() => {
                tick();
                setCreating(true);
              }}
              style={({ pressed }) => [styles.newProjectButton, pressed && styles.pressed, webCursor]}
            >
              <Text style={styles.newProjectButtonText}>+ New Blank Project</Text>
            </Pressable>
          )}
          {projects.length === 0 ? (
            <Text style={styles.sheetEmpty}>No projects yet. Create a blank one above or start one from Patterns.</Text>
          ) : (
            projects.map((item) => (
              <ProjectOption
                key={item.id}
                project={item}
                selected={item.id === project?.id}
                onSelect={() => {
                  tick();
                  setFullscreen(false);
                  setActiveProject(item.id);
                  closeSwitcher();
                }}
                onDelete={() => {
                  tick('impact');
                  deleteProject(item.id);
                }}
              />
            ))
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={stashOpen && project != null && slot != null}
        onClose={() => setStashOpen(false)}
        header={<Text style={styles.sheetTitle}>Load {slot?.id ?? selectedSlot} from Stash</Text>}
      >
        <View style={styles.sheetBody}>
          {yarnStash.length === 0 ? (
            <Text style={styles.sheetEmpty}>Your stash is empty. Add a skein on the Me tab first.</Text>
          ) : (
            yarnStash.map((item) => {
              const meta = yarnWeightMeta(item.yarnWeight);
              const loadedHere = slot?.stashItemId === item.id;
              const loadedElsewhere = project?.slots.find((other) => other.id !== slot?.id && other.stashItemId === item.id)?.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: loadedHere }}
                  accessibilityLabel={`Load ${item.brand} ${item.colorName} into ${slot?.id ?? selectedSlot}`}
                  testID={`stash-option-${item.id}`}
                  onPress={() => {
                    if (!slot) return;
                    tick('impact');
                    assignStashToSlot(slot.id, item.id);
                    setStashOpen(false);
                  }}
                  style={({ pressed }) => [styles.stashRow, loadedHere && styles.stashRowSelected, pressed && styles.pressed, webCursor]}
                >
                  <View style={[styles.stashSwatch, { backgroundColor: item.hexColor }]} />
                  <View style={styles.stashCopy}>
                    <Text numberOfLines={1} style={styles.yarnBrand}>
                      {item.brand}
                    </Text>
                    <Text numberOfLines={1} style={styles.projectName}>
                      {item.colorName}
                    </Text>
                    <View style={styles.stashMetaRow}>
                      <View style={styles.weightBadge}>
                        <Text style={styles.weightBadgeText}>
                          {meta.label} {meta.number}
                        </Text>
                      </View>
                      <Text style={styles.projectMeta}>
                        {item.skeinCount} {item.skeinCount === 1 ? 'skein' : 'skeins'}
                      </Text>
                    </View>
                  </View>
                  {loadedHere ? (
                    <Text style={styles.stashTagLive}>Loaded</Text>
                  ) : loadedElsewhere ? (
                    <Text style={styles.stashTag}>In {loadedElsewhere}</Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={toolingOpen && project != null}
        onClose={() => setToolingOpen(false)}
        header={<Text style={styles.sheetTitle}>Project Setup</Text>}
      >
        {project ? (
          <View style={styles.sheetBody}>
            <Text style={styles.sheetSection}>Project name</Text>
            <ProjectNameInput
              key={`${project.id}:${project.name}`}
              name={project.name}
              onCommit={(name) => {
                tick();
                renameProject(name);
              }}
            />
            <NumberStepper
              label="Total rows"
              testID="setup-total-rows"
              value={project.totalRows}
              min={Math.max(1, project.currentRow)}
              hint={`You're on row ${project.currentRow}, so the goal can't drop below it.`}
              onChange={setTotalRows}
            />
            <NumberStepper
              label="Stitches per row"
              testID="setup-stitches-per-row"
              value={project.stitchesPerRow}
              min={1}
              hint="Changing this clears undo history for the project."
              onChange={setStitchesPerRow}
            />
            <Text style={styles.sheetSection}>Hook size</Text>
            <View style={styles.chips}>
              {HOOK_SIZE_OPTIONS.map((option) => {
                const current = parseHookMillimeters(project.hookSize);
                const selected = current != null && Math.abs(current - option.millimeters) < 0.02;
                const label = `${formatMillimeterHook(option.millimeters)} · ${option.letter}`;
                return (
                  <Pressable
                    key={option.letter}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      tick();
                      setHookAndYarn({ hookSize: formatMillimeterHook(option.millimeters) });
                    }}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sheetSection}>Yarn weight</Text>
            <View style={styles.chips}>
              {YARN_WEIGHTS.map((weight) => {
                const meta = yarnWeightMeta(weight);
                const selected = project.yarnWeight === weight;
                return (
                  <Pressable
                    key={weight}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      tick();
                      setHookAndYarn({ yarnWeight: weight });
                    }}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {meta.label} {meta.number}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <PhotoProgressModal
        visible={photoOpen && project != null}
        projectId={project?.id ?? null}
        incomingUri={draftUri}
        initialView={photoView}
        notice={photoNotice}
        onClose={() => {
          setPhotoOpen(false);
          setDraftUri(null);
        }}
      />

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
        <View style={[styles.fullscreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen"
            testID="fullscreen-close"
            onPress={() => setFullscreen(false)}
            style={({ pressed }) => [styles.fullscreenClose, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.fullscreenCloseText}>Close</Text>
          </Pressable>
          <View style={styles.fullscreenPlayer}>{videoId ? <YouTubeEmbed videoId={videoId} /> : null}</View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerCard({
  pattern,
  videoId,
  fullscreen,
  onOpenLog,
  onSnapshot,
  onFullscreen,
}: {
  pattern: CrochetPattern | null;
  videoId: string | null;
  fullscreen: boolean;
  onOpenLog: () => void;
  onSnapshot: () => void;
  onFullscreen: () => void;
}) {
  const poster = pattern ? youtubeThumbnailUrl(pattern.videoId, 'hq') : null;
  return (
    <View style={styles.player} testID="youtube-player">
      {poster ? <Image accessible={false} source={{ uri: poster }} style={styles.playerPoster} /> : null}
      {videoId && !fullscreen ? <YouTubeEmbed videoId={videoId} /> : null}
      {!videoId ? (
        <View style={styles.playerEmpty} pointerEvents="none">
          <Text style={styles.playerEmptyText}>No tutorial linked</Text>
        </View>
      ) : null}
      <View style={styles.playerOverlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Progress log"
          testID="progress-log"
          onPress={() => {
            tick();
            onOpenLog();
          }}
          style={({ pressed }) => [styles.logPill, pressed && styles.pressed, webCursor]}
        >
          <CameraIcon size={14} />
          <Text style={styles.logPillText}>Progress Log &gt;</Text>
        </Pressable>
        <View style={styles.playerActions} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={Platform.OS === 'web' ? 'Upload progress photo' : 'Snap progress photo'}
            testID="camera-snapshot"
            onPress={onSnapshot}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed, webCursor]}
          >
            <CameraIcon size={16} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fullscreen"
            accessibilityState={{ disabled: videoId == null }}
            disabled={videoId == null}
            testID="camera-fullscreen"
            onPress={onFullscreen}
            style={({ pressed }) => [styles.roundButton, videoId == null && styles.roundButtonDisabled, pressed && styles.pressed, webCursor]}
          >
            <FullscreenIcon />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProgressCard({
  project,
  pattern,
  canUndo,
  autoAdvance,
  onStitch,
  onRow,
  onUndo,
  onFinish,
  onReopen,
}: {
  project: CrochetProject;
  pattern: CrochetPattern | null;
  canUndo: boolean;
  autoAdvance: boolean;
  onStitch: () => void;
  onRow: () => void;
  onUndo: () => void;
  onFinish: () => void;
  onReopen: () => void;
}) {
  const percent = rowPercent(project);
  const live = project.status === 'in-progress';
  const finished = project.status === 'finished';
  const atGoal = project.currentRow >= project.totalRows;
  // A finished make is frozen until it's reopened.
  const stitchBlocked =
    finished ||
    (project.currentStitch >= project.stitchesPerRow && (!autoAdvance || project.currentRow >= project.totalRows));
  const rowBlocked = finished || atGoal;
  const undoBlocked = finished || (!canUndo && project.currentStitch <= 0 && project.currentRow <= 1);
  const poster = pattern ? youtubeThumbnailUrl(pattern.videoId, 'hq') : null;
  const finishEarly = useArmed();

  const onFinishPress = () => {
    // Before the last row, the first tap only arms so a stray thumb can't end the make.
    if (!atGoal && !finishEarly.armed) {
      tick('impact');
      finishEarly.arm();
      return;
    }
    finishEarly.disarm();
    onFinish();
  };

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressHead}>
        {poster ? (
          <Image accessible={false} source={{ uri: poster }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: project.slots[0]?.hexColor ?? Colors.elevatedControl }]} />
        )}
        <View style={styles.progressCopy}>
          <Text numberOfLines={2} style={styles.patternTitle}>
            {pattern?.title ?? project.name}
          </Text>
          <Text testID="active-subtitle" style={styles.patternSubtitle}>
            {specLine(project)}
          </Text>
        </View>
      </View>

      <View style={styles.percentRow}>
        <Text testID="active-percent" style={styles.percent}>
          {percent}%
        </Text>
        <Text style={[styles.percentStatus, live && styles.percentStatusLive]}>{live ? 'Active' : 'Finished'}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text testID="active-counter" style={styles.counterLine}>
        Row {project.currentRow}/{project.totalRows} • Stitch {project.currentStitch}/{project.stitchesPerRow}
      </Text>

      <View style={styles.pills}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add one stitch"
          accessibilityState={{ disabled: stitchBlocked }}
          disabled={stitchBlocked}
          testID="counter-stitch"
          onPress={onStitch}
          style={({ pressed }) => [styles.pill, stitchBlocked && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.pillText}>+1 Stitch</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add one row"
          accessibilityState={{ disabled: rowBlocked }}
          disabled={rowBlocked}
          testID="counter-row"
          onPress={onRow}
          style={({ pressed }) => [styles.pill, rowBlocked && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.pillText}>+1 Row</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo last count"
          accessibilityState={{ disabled: undoBlocked }}
          disabled={undoBlocked}
          testID="counter-undo"
          onPress={onUndo}
          style={({ pressed }) => [styles.pill, undoBlocked && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.pillText}>Undo (-1)</Text>
        </Pressable>
      </View>

      {finished ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reopen make"
          testID="project-reopen"
          onPress={onReopen}
          style={({ pressed }) => [styles.cta, styles.ctaSecondary, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.ctaText}>Reopen Make</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={finishEarly.armed ? 'Confirm finish make early' : 'Finish make'}
          testID="project-finish"
          onPress={onFinishPress}
          style={({ pressed }) => [
            styles.cta,
            atGoal ? styles.ctaPrimary : styles.ctaSecondary,
            finishEarly.armed && styles.ctaArmed,
            pressed && styles.pressed,
            webCursor,
          ]}
        >
          <Text style={[styles.ctaText, atGoal && styles.ctaTextPrimary, finishEarly.armed && styles.ctaTextArmed]}>
            {finishEarly.armed ? `Finish at row ${project.currentRow}? Tap again` : 'Finish Make ✓'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ProjectOption({
  project,
  selected,
  onSelect,
  onDelete,
}: {
  project: CrochetProject;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const finished = project.status === 'finished';
  // The make on the hook is protected unless it's already finished.
  const deletable = !selected || finished;
  const confirm = useArmed();

  return (
    <View style={[styles.projectRow, selected && styles.projectRowSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        testID={`project-option-${project.id}`}
        onPress={onSelect}
        style={({ pressed }) => [styles.projectSelect, pressed && styles.pressed, webCursor]}
      >
        <View style={styles.projectCopy}>
          <Text numberOfLines={1} style={styles.projectName}>
            {project.name}
          </Text>
          <Text style={styles.projectMeta}>
            {finished ? 'Finished · ' : ''}
            {rowPercent(project)}% · Row {project.currentRow}/{project.totalRows}
          </Text>
        </View>
        {selected ? <View style={[styles.statusDot, !finished && styles.statusDotLive]} /> : null}
      </Pressable>
      {deletable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirm.armed ? `Confirm delete ${project.name}` : `Delete ${project.name}`}
          accessibilityHint="Also removes its progress photos."
          testID={`project-delete-${project.id}`}
          hitSlop={Layout.hitSlop}
          onPress={() => {
            if (!confirm.armed) {
              tick('impact');
              confirm.arm();
              return;
            }
            confirm.disarm();
            onDelete();
          }}
          style={({ pressed }) => [styles.deleteButton, confirm.armed && styles.deleteButtonArmed, pressed && styles.pressed, webCursor]}
        >
          {confirm.armed ? <Text style={styles.deleteText}>Delete?</Text> : <TrashIcon />}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Commits on blur or return so every keystroke isn't a store write. Remount via `key` to resync. */
function ProjectNameInput({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const clean = draft.replace(/\s+/g, ' ').trim();
    if (!clean) {
      setDraft(name);
      return;
    }
    setDraft(clean);
    if (clean !== name) onCommit(clean);
  };

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder="Project name"
      placeholderTextColor={Colors.textTertiary}
      returnKeyType="done"
      maxLength={80}
      accessibilityLabel="Project name"
      testID="setup-project-name"
      style={styles.input}
    />
  );
}

function NumberStepper({
  label,
  value,
  min,
  max = MAX_COUNT,
  hint,
  testID,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  hint?: string;
  testID: string;
  onChange: (value: number) => void;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    tick();
    onChange(next);
  };

  return (
    <View style={styles.stepperField}>
      <Text style={styles.sheetSection}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          accessibilityHint="Long press to step by 10."
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          testID={`${testID}-down`}
          onPress={() => step(-1)}
          onLongPress={() => step(-10)}
          delayLongPress={350}
          style={({ pressed }) => [styles.stepperButton, atMin && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <StepperInput key={value} label={label} value={value} min={min} max={max} testID={testID} onCommit={onChange} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          accessibilityHint="Long press to step by 10."
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          testID={`${testID}-up`}
          onPress={() => step(1)}
          onLongPress={() => step(10)}
          delayLongPress={350}
          style={({ pressed }) => [styles.stepperButton, atMax && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>
      {hint ? <Text style={styles.stepperHint}>{hint}</Text> : null}
    </View>
  );
}

function StepperInput({
  label,
  value,
  min,
  max,
  testID,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  testID: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="number-pad"
      inputMode="numeric"
      returnKeyType="done"
      maxLength={String(MAX_COUNT).length}
      selectTextOnFocus
      accessibilityLabel={label}
      testID={testID}
      style={styles.stepperInput}
    />
  );
}

/** Two-tap confirm: the first tap arms for a moment, the second one acts. */
function useArmed(timeoutMs = 2500) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    armed,
    arm: () => {
      if (timer.current) clearTimeout(timer.current);
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), timeoutMs);
    },
    disarm: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setArmed(false);
    },
  };
}

function HookYarnBody({ project }: { project: CrochetProject }) {
  const millimeters = parseHookMillimeters(project.hookSize);
  const letter = hookLetterSize(project.hookSize);
  const yarn = yarnWeightMeta(project.yarnWeight);
  const hookValue = millimeters == null ? project.hookSize || '—' : formatMillimeterHook(millimeters).replace(' mm', '');
  const hookUnit = millimeters == null ? 'Hook' : letter ? `mm · ${letter}` : 'mm';

  return (
    <>
      <Text style={styles.cardKicker}>Hook & Yarn</Text>
      <View style={styles.metricRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricValue}>{hookValue}</Text>
          <Text style={styles.metricUnit}>{hookUnit}</Text>
        </View>
        <View style={styles.metricBlock}>
          <Text style={styles.metricValue}>{yarn.number}</Text>
          <Text style={styles.metricUnit}>{yarn.label}</Text>
        </View>
      </View>
      <View style={styles.hookGlyph} pointerEvents="none">
        <HookGlyph />
      </View>
    </>
  );
}

function ProjectTimerCard() {
  const timer = useProjectTimer();
  const startTimer = useCrochetStore((state) => state.startTimer);
  const pauseTimer = useCrochetStore((state) => state.pauseTimer);
  const resetTimer = useCrochetStore((state) => state.resetTimer);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = timer.project?.status === 'finished';

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const onReset = () => {
    tick('impact');
    if (!armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 2500);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
    resetTimer();
  };

  return (
    <View style={styles.bentoHalf}>
      <Text style={styles.cardKicker}>Project Timer</Text>
      <Text testID="project-timer" style={styles.timerReadout}>
        {timer.label}
      </Text>
      <View style={styles.timerButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play timer"
          accessibilityState={{ disabled: timer.running || finished }}
          disabled={timer.running || finished}
          testID="timer-play"
          onPress={() => {
            tick('impact');
            startTimer();
          }}
          style={({ pressed }) => [styles.timerButton, (timer.running || finished) && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <PlayIcon />
          <Text style={styles.timerButtonLabel}>Play</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause timer"
          accessibilityState={{ disabled: !timer.running }}
          disabled={!timer.running}
          testID="timer-pause"
          onPress={() => {
            tick('impact');
            pauseTimer();
          }}
          style={({ pressed }) => [styles.timerButton, !timer.running && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <PauseIcon />
          <Text style={styles.timerButtonLabel}>Pause</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={armed ? 'Confirm reset timer' : 'Reset timer'}
          testID="timer-reset"
          onPress={onReset}
          style={({ pressed }) => [styles.timerButton, armed && styles.timerButtonArmed, pressed && styles.pressed, webCursor]}
        >
          <ResetIcon />
          <Text style={[styles.timerButtonLabel, armed && styles.timerButtonLabelArmed]}>{armed ? 'Sure?' : 'Reset'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SlotDetail({
  slot,
  onLoad,
  onStep,
  onUnload,
}: {
  slot: AmsYarnSlot;
  onLoad: () => void;
  onStep: (delta: number) => void;
  onUnload: () => void;
}) {
  const loadPill = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Load ${slot.id} from stash`}
      testID="slot-load"
      onPress={onLoad}
      style={({ pressed }) => [styles.slotPill, styles.slotPillPrimary, pressed && styles.pressed, webCursor]}
    >
      <Text style={[styles.slotPillText, styles.slotPillTextPrimary]}>Load from Stash</Text>
    </Pressable>
  );

  if (isSlotEmpty(slot)) {
    return (
      <View testID="yarn-slot-detail" style={styles.slotDetail}>
        <Text style={styles.yarnBrand}>{slot.id}</Text>
        <Text style={styles.yarnName}>Empty slot</Text>
        <View style={styles.slotActions}>{loadPill}</View>
      </View>
    );
  }

  const size = slot.yarnWeight ? `${yarnWeightMeta(slot.yarnWeight).label} · ${yarnWeightMeta(slot.yarnWeight).number}` : 'Size —';
  const atMin = slot.remainingPercent <= 0;
  const atMax = slot.remainingPercent >= 100;

  return (
    <View testID="yarn-slot-detail" style={styles.slotDetail}>
      <Text style={styles.yarnBrand}>{slot.brand}</Text>
      <Text style={styles.yarnName}>{slot.colorName}</Text>
      <Text style={styles.yarnMeta}>{size}</Text>
      <Text style={styles.yarnMeta}>{slot.remainingPercent}% remaining</Text>
      <View style={styles.miniTrack}>
        <View style={[styles.miniFill, { width: `${slot.remainingPercent}%`, backgroundColor: slot.hexColor }]} />
      </View>
      <View style={styles.slotActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${slot.id} remaining by 10 percent`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          testID="slot-step-down"
          onPress={() => onStep(-10)}
          style={({ pressed }) => [styles.slotPill, atMin && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.slotPillText}>-10%</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${slot.id} remaining by 10 percent`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          testID="slot-step-up"
          onPress={() => onStep(10)}
          style={({ pressed }) => [styles.slotPill, atMax && styles.pillDisabled, pressed && styles.pressed, webCursor]}
        >
          <Text style={styles.slotPillText}>+10%</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unload ${slot.id}`}
          testID="slot-unload"
          onPress={onUnload}
          style={({ pressed }) => [styles.slotPill, pressed && styles.pressed, webCursor]}
        >
          <Text style={[styles.slotPillText, styles.slotPillTextDanger]}>Unload</Text>
        </Pressable>
      </View>
      <View style={styles.slotActions}>{loadPill}</View>
    </View>
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function PillSwitch({ on }: { on: boolean }) {
  return (
    <View style={[styles.switchTrack, on && styles.switchTrackOn]}>
      <View style={[styles.switchKnob, on && styles.switchKnobOn]} />
    </View>
  );
}

function rowPercent(project: CrochetProject): number {
  if (project.totalRows <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((project.currentRow / project.totalRows) * 100)));
}

function specLine(project: CrochetProject): string {
  const size = yarnWeightMeta(project.yarnWeight).number;
  const hook = formatHookSize(project.hookSize);
  const hookText = hook === '—' ? '— Hook' : `${hook} Hook`;
  return `Yarn Size ${size} • ${hookText} • ${project.stitchesPerRow} Stitches/Row`;
}

function tick(kind: 'selection' | 'impact' = 'selection') {
  if (Platform.OS === 'web') return;
  if (kind === 'impact') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.selectionAsync();
}

function SwitcherIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M7 7.5 H15.5 A2.5 2.5 0 0 1 18 10 V18.5 A2.5 2.5 0 0 1 15.5 21 H7 A2.5 2.5 0 0 1 4.5 18.5 V10 A2.5 2.5 0 0 1 7 7.5 Z" stroke={Colors.textPrimary} strokeWidth={1.7} />
      <Path d="M8 7.5 V6 A2.5 2.5 0 0 1 10.5 3.5 H18 A2.5 2.5 0 0 1 20.5 6 V13.5 A2.5 2.5 0 0 1 18 16 H17.5" stroke={Colors.textPrimary} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function CameraIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8.5 H8 L9.5 6.5 H14.5 L16 8.5 H20 A1.5 1.5 0 0 1 21.5 10 V18 A1.5 1.5 0 0 1 20 19.5 H4 A1.5 1.5 0 0 1 2.5 18 V10 A1.5 1.5 0 0 1 4 8.5 Z" stroke={Colors.textPrimary} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M12 16.2 A2.7 2.7 0 1 0 12 10.8 A2.7 2.7 0 0 0 12 16.2 Z" stroke={Colors.textPrimary} strokeWidth={1.7} />
    </Svg>
  );
}

function FullscreenIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9 V5 H8" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 9 V5 H16" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 15 V19 H8" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 15 V19 H16" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HookGlyph() {
  return (
    <Svg width={36} height={36} viewBox="0 0 48 48" fill="none">
      <Path d="M30 6 H22" stroke="#D1D1D6" strokeWidth={3} strokeLinecap="round" />
      <Path d="M26 6 V24 C26 32 20 36 14 36 C9 36 6 33 6 29" stroke="#D1D1D6" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

function PlayIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5 L19 12 L8 19 Z" fill={Colors.textPrimary} />
    </Svg>
  );
}

function PauseIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M6 5 H10 V19 H6 Z M14 5 H18 V19 H14 Z" fill={Colors.textPrimary} />
    </Svg>
  );
}

function ResetIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12 A7 7 0 1 1 16.5 6.5" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M16 3.5 V8 H20.5" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrashIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6.5 H20" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9 6.5 V4.5 H15 V6.5" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M6.5 6.5 L7.5 20 H16.5 L17.5 6.5" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M10 10.5 V16 M14 10.5 V16" stroke={Colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: Spacing.xxs,
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textSecondary,
  },
  statusDotLive: {
    backgroundColor: Colors.accentPrimary,
    ...Platform.select({
      web: { boxShadow: '0 0 8px rgba(0, 230, 118, 0.9)' },
      default: {
        shadowColor: Colors.accentPrimary,
        shadowOpacity: 0.9,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
      },
    }),
  },
  statusLabel: {
    ...Typography.callout,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  statusLabelLive: {
    color: Colors.accentPrimary,
  },
  switcher: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardSurface,
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  playerPoster: {
    ...StyleSheet.absoluteFill,
  },
  playerEmpty: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerEmptyText: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  playerOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  logPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
  },
  logPillText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  playerActions: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  roundButtonDisabled: {
    opacity: 0.4,
  },
  progressCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  progressHead: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    backgroundColor: Colors.elevatedControl,
  },
  progressCopy: {
    flex: 1,
    gap: 4,
  },
  patternTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  patternSubtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  percentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  percent: {
    fontFamily: FontFamily.medium,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: FontWeight.bold,
    letterSpacing: -1,
    color: Colors.textPrimary,
  },
  percentStatus: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  percentStatusLive: {
    color: Colors.accentPrimary,
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: '#3A3A3C',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: '#00E676',
  },
  counterLine: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  pills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  pill: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.elevatedControl,
  },
  pillDisabled: {
    opacity: 0.38,
  },
  pillText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  cta: {
    minHeight: 48,
    marginTop: Spacing.xs,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  ctaPrimary: {
    backgroundColor: Colors.accentPrimary,
    ...Platform.select({
      web: { boxShadow: '0 0 18px rgba(0, 230, 118, 0.35)' },
      default: {
        shadowColor: Colors.accentPrimary,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
      },
    }),
  },
  ctaSecondary: {
    backgroundColor: Colors.transparent,
    borderColor: Colors.border,
  },
  ctaArmed: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  ctaText: {
    ...Typography.label,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  ctaTextPrimary: {
    color: Colors.onAccent,
  },
  ctaTextArmed: {
    color: Colors.accentPrimary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  bento: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.md,
  },
  bentoTall: {
    flex: 1,
    minHeight: 188,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  bentoStack: {
    flex: 1,
    gap: Spacing.md,
  },
  bentoHalf: {
    flex: 1,
    minHeight: 88,
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  cardKicker: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metricBlock: {
    flex: 1,
  },
  metricValue: {
    fontFamily: FontFamily.medium,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.6,
    color: Colors.textPrimary,
  },
  metricUnit: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  hookGlyph: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
  },
  timerReadout: {
    marginTop: Spacing.xs,
    fontFamily: FontFamily.mono,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.4,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  timerButtons: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Spacing.sm,
  },
  timerButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: Colors.elevatedControl,
  },
  timerButtonArmed: {
    backgroundColor: Colors.accentMuted,
  },
  timerButtonLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  timerButtonLabelArmed: {
    color: Colors.accentPrimary,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  autoCopy: {
    flex: 1,
    gap: 2,
  },
  autoState: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  autoStateOn: {
    color: Colors.accentPrimary,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  switchTrackOn: {
    backgroundColor: '#00E676',
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textPrimary,
  },
  switchKnobOn: {
    alignSelf: 'flex-end',
  },
  ams: {
    borderWidth: 1.5,
    borderColor: '#00E676',
    borderRadius: Radius.lg,
    backgroundColor: Colors.cardSurface,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  swatch: {
    flex: 1,
    height: 72,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.transparent,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  swatchSelected: {
    borderColor: '#00E676',
  },
  swatchLabelBar: {
    alignItems: 'center',
    paddingVertical: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  swatchLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  slotDetail: {
    gap: 2,
  },
  yarnBrand: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  yarnName: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  yarnMeta: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  miniTrack: {
    height: 6,
    marginTop: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: '#3A3A3C',
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  slotActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  slotPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.elevatedControl,
  },
  slotPillPrimary: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  slotPillText: {
    ...Typography.callout,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  slotPillTextPrimary: {
    color: Colors.accentPrimary,
  },
  slotPillTextDanger: {
    color: Colors.danger,
  },
  stashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.transparent,
    backgroundColor: Colors.elevatedControl,
  },
  stashRowSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  stashSwatch: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stashCopy: {
    flex: 1,
    gap: Spacing.xxs,
  },
  stashMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxs,
  },
  weightBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.cardSurface,
  },
  weightBadgeText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  stashTag: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  stashTagLive: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  sheetTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sheetBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sheetSection: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  sheetEmpty: {
    ...Typography.callout,
    color: Colors.textSecondary,
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
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    paddingRight: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
  },
  projectRowSelected: {
    backgroundColor: Colors.accentMuted,
  },
  projectSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    alignSelf: 'stretch',
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  deleteButton: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  deleteButtonArmed: {
    backgroundColor: 'rgba(255, 90, 78, 0.14)',
    borderColor: Colors.danger,
  },
  deleteText: {
    ...Typography.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.danger,
  },
  newProjectButton: {
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.accentPrimary,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  newProjectButtonText: {
    ...Typography.label,
    color: Colors.accentPrimary,
  },
  newProjectForm: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
    backgroundColor: Colors.backgroundPrimary,
    marginBottom: Spacing.xs,
  },
  newProjectActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
  stepperField: {
    gap: Spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  stepperGlyph: {
    fontFamily: FontFamily.medium,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  stepperInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.elevatedControl,
    paddingHorizontal: Spacing.md,
    fontFamily: FontFamily.mono,
    fontSize: 20,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepperHint: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  projectCopy: {
    flex: 1,
    gap: 2,
  },
  projectName: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  projectMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  fullscreen: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    zIndex: 2,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
  },
  fullscreenCloseText: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  fullscreenPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
  },
  pressed: {
    opacity: 0.72,
  },
});
