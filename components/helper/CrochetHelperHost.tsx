import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, AppState, BackHandler, Easing, Image, Keyboard, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, Elevation, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useKeyboardOverlap } from '@/hooks/useKeyboardInset';
import { selectActiveProject, useCrochetStore, type CrochetPattern } from '@/store/useCrochetStore';
import { loadRepoPatternCatalog } from '@/utils/patternCatalog';
import { patternThumbnailUriCandidates } from '@/utils/catalogPreview';
import {
  CALCULATIONS, CALCULATOR_FIELDS, CALCULATOR_NAMES, CONVERSION_PAIRS,
  calculateCrochet, type Calculation,
} from '@/utils/helper/calculators';
import { contextKey, contextLabel, getStarters, HELPER_GREETING, type HelperAction, type HelperContext, type HelperMessage } from '@/utils/helper/context';
import { answerHelper } from '@/utils/helper/service';
import { helperInference } from '@/utils/helper/inference';
import { getHelperModelStatus, prefetchHelperModel, subscribeHelperModelStatus } from '@/utils/helper/model';
import { helperSession } from '@/utils/helper/session';

type Props = {
  surface?: string;
  pattern?: CrochetPattern | null;
  inline?: boolean;
  /** Distance from the screen bottom to the inline launcher (e.g. pattern detail action bar). */
  launcherBottomInset?: number;
  renderPreview: (pattern: CrochetPattern, onClose: () => void) => ReactNode;
};

const QUICK_TOOLS: { id: Calculation; label: string }[] = [
  { id: 'yarn', label: 'Yarn left' },
  { id: 'skeins', label: 'Skeins' },
  { id: 'gauge', label: 'Gauge' },
  { id: 'shaping', label: 'Increases' },
  { id: 'convert', label: 'Convert' },
  { id: 'time', label: 'Time left' },
];

let messageSequence = 0;
const id = () => `helper-${Date.now()}-${++messageSequence}`;

function helperStatusLabel(
  status: ReturnType<typeof getHelperModelStatus>,
  busy: boolean,
  phase: string,
): string {
  if (busy && phase) return phase;
  if (status.phase === 'ready') return 'On this device · private';
  if (status.phase === 'download') return status.detail || 'Getting ready…';
  if (status.phase === 'checking') return 'Checking helper files…';
  if (status.phase === 'failed') return 'Calculators ready · AI unavailable';
  return 'On this device · calculators always work';
}

/** One conversation, with an overlay rendered inside the currently active native surface. */
export function CrochetHelperHost({
  surface = 'main',
  pattern = null,
  inline = false,
  launcherBottomInset = 0,
  renderPreview,
}: Props) {
  const state = useSyncExternalStore(helperSession.subscribe, helperSession.snapshot, helperSession.snapshot);
  const modelStatus = useSyncExternalStore(subscribeHelperModelStatus, getHelperModelStatus, getHelperModelStatus);
  const account = useCrochetStore((s) => s.account);
  const activePatternId = useCrochetStore((s) => s.activeProjectId
    ? s.projects.find((p) => p.id === s.activeProjectId)?.patternId ?? null
    : null);
  const yarns = useCrochetStore((s) => s.yarnStash) ?? [];
  const appendRowNote = useCrochetStore((s) => s.appendRowNote);
  const setStitchesPerRow = useCrochetStore((s) => s.setStitchesPerRow);
  const project = useCrochetStore(selectActiveProject);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const overlayRef = useRef<View>(null);
  const [lift] = useState(() => new Animated.Value(0));
  const liftValue = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const [overlayHeight, setOverlayHeight] = useState(height);
  const [calculator, setCalculator] = useState<Calculation | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const [preview, setPreview] = useState<CrochetPattern | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const uid = account?.uid ?? null;
  const open = state.surface === surface && state.owner === uid && uid !== null;
  const { overlap, height: keyboardHeight, duration: keyboardDuration } = useKeyboardOverlap(overlayRef, open, overlayHeight);
  const context = useMemo<HelperContext>(() => {
    if (state.contextChoice === 'none') return { pattern: null, project: null };
    if (state.contextChoice === 'active' || (!pattern && pathname.includes('active'))) {
      const patterns = useCrochetStore.getState().patterns;
      return { project, pattern: project?.patternId ? patterns.find((p) => p.id === project.patternId) ?? null : null };
    }
    return { pattern, project: null };
  }, [pattern, project, pathname, state.contextChoice, activePatternId]);
  const key = contextKey(context);
  const keyboardOpen = keyboardHeight > 0;
  const compact = open && keyboardOpen;
  const buildCatalog = useCallback(() => {
    const byId = new Map(loadRepoPatternCatalog().map((p) => [p.id, p]));
    for (const p of useCrochetStore.getState().patterns) byId.set(p.id, p);
    return [...byId.values()];
  }, []);

  useEffect(() => {
    if (!open || liftValue.current === overlap) return;
    liftValue.current = overlap;
    Animated.timing(lift, {
      toValue: overlap,
      duration: Math.max(0, keyboardDuration),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [keyboardDuration, lift, open, overlap]);
  useEffect(() => {
    if (open) return;
    liftValue.current = 0;
    lift.setValue(0);
  }, [lift, open]);

  useEffect(() => {
    helperSession.bindOwner(uid);
    if (surface === 'main') void helperInference.dispose().catch(() => undefined);
    return () => {
      if (surface === 'main') {
        helperSession.bindOwner(null);
        void helperInference.dispose().catch(() => undefined);
      }
    };
  }, [uid, surface]);
  useEffect(() => {
    if (surface !== 'main') return;
    const release = () => { helperSession.cancel(); void helperInference.dispose().catch(() => undefined); };
    const stateSubscription = AppState.addEventListener('change', (next) => { if (next !== 'active') release(); });
    const memorySubscription = AppState.addEventListener('memoryWarning', release);
    return () => { stateSubscription.remove(); memorySubscription.remove(); };
  }, [surface]);
  useEffect(() => {
    return () => { if (helperSession.snapshot().surface === surface) helperSession.close(surface); };
  }, [surface]);
  useEffect(() => {
    if (helperSession.snapshot().surface === surface) helperSession.cancel();
  }, [key, surface]);
  useEffect(() => {
    if (!open) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (keyboardOpen) { Keyboard.dismiss(); return true; }
      helperSession.close(surface);
      return true;
    });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') helperSession.close(surface); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('keydown', escape);
    return () => {
      back.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('keydown', escape);
    };
  }, [keyboardOpen, open, surface]);
  const previousOpen = useRef(false);
  useEffect(() => {
    if (open && !previousOpen.current) prefetchHelperModel();
    previousOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
  }, [keyboardOpen, open, state.partial, state.messages.length]);
  if (!open && composerFocused) setComposerFocused(false);
  if (!open && contextMenu) setContextMenu(false);

  const send = async (question = helperSession.snapshot().draft) => {
    const text = question.trim().slice(0, 1000);
    if (!text || helperSession.snapshot().busy) return;
    Keyboard.dismiss();
    const controller = new AbortController();
    const history = helperSession.snapshot().messages;
    const message: HelperMessage = { id: id(), role: 'user', text, contextKey: key, contextLabel: contextLabel(context) };
    const generation = helperSession.begin(message, () => controller.abort());
    if (generation === null) return;
    try {
      const reply = await answerHelper({ question: text, context, history, catalog: buildCatalog(), yarns, signal: controller.signal,
        onPhase: (phase) => { if (helperSession.current(generation)) helperSession.patch({ phase }); },
        onText: (partial) => helperSession.stream(generation, partial) });
      if (!reply.text) return;
      if (helperSession.finish(generation, { ...message, ...reply, id: id(), role: 'assistant' }) && reply.calculator && !reply.calculated) setCalculator(reply.calculator);
    } catch {
      helperSession.finish(generation, { ...message, id: id(), role: 'assistant', failed: true,
        text: 'The helper could not finish. Try again or open a calculator.' });
    } finally {
      if (helperSession.current(generation)) helperSession.cancel();
    }
  };
  const stopReply = () => {
    const snapshot = helperSession.snapshot();
    helperSession.cancel();
    if (snapshot.busy) helperSession.append({ id: id(), role: 'assistant', text: 'Stopped. You can retry the last question.',
      contextKey: key, contextLabel: contextLabel(context), failed: true });
  };
  const retry = () => {
    const last = [...state.messages].reverse().find((m) => m.role === 'user' && m.contextKey === key);
    if (last) void send(last.text);
  };
  const openPreview = (p: CrochetPattern) => {
    Keyboard.dismiss();
    helperSession.close(surface);
    setPreview(p);
  };
  const runAction = (action: HelperAction) => {
    if (!project) {
      helperSession.append({ id: id(), role: 'assistant', text: 'Open an active project before saving this to the row counter.',
        contextKey: key, contextLabel: contextLabel(context), failed: true });
      return;
    }
    if (action.kind === 'row-note') {
      appendRowNote(action.text);
      helperSession.append({ id: id(), role: 'assistant', text: 'Saved to the active project’s row note.',
        contextKey: key, contextLabel: contextLabel(context) });
      return;
    }
    setStitchesPerRow(action.stitches);
    helperSession.append({ id: id(), role: 'assistant', text: `Stitch target set to ${action.stitches}.`,
      contextKey: key, contextLabel: contextLabel(context) });
  };
  const appendCalculation = (operation: Calculation, values: number[], units: string[]) => {
    const result = calculateCrochet({ operation, values, units });
    if (state.busy) helperSession.cancel();
    const actions: HelperAction[] = [];
    if (result.ok) {
      actions.push({ kind: 'row-note', text: result.text.split('\n')[0] ?? result.text });
      if (operation === 'shaping' && Number.isInteger(values[1]) && values[1] > 0) actions.push({ kind: 'stitch-target', stitches: values[1] });
      if (operation === 'gauge') {
        const count = Number(result.text.match(/^(\d+) stitches/)?.[1]);
        if (Number.isInteger(count) && count > 0) actions.push({ kind: 'stitch-target', stitches: count });
      }
    }
    helperSession.append({ id: id(), role: 'assistant', text: `${CALCULATOR_NAMES[operation]}\n\n${result.text}`,
      contextKey: key, contextLabel: contextLabel(context), calculator: operation, calculated: true, failed: !result.ok,
      actions: actions.length ? actions : undefined });
  };
  const closeHelper = () => {
    Keyboard.dismiss();
    helperSession.close(surface);
  };
  const onBackdropPress = () => {
    if (keyboardOpen) { Keyboard.dismiss(); return; }
    closeHelper();
  };
  const onOverlayLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next > 0 && Math.abs(next - overlayHeight) > 1) setOverlayHeight(next);
  };
  const starters = getStarters(context, pathname, yarns);
  if (!uid || uid !== state.owner) return null;
  const lastReply = state.messages[state.messages.length - 1];
  const about = contextLabel(context);
  const restingHeight = Math.min(720, Math.round(overlayHeight * 0.88));
  const canSend = state.busy || Boolean(state.draft.trim());
  const showLauncher = !open && !preview && !keyboardOpen;
  return (
    <>
      {showLauncher ? (
        <Pressable
          accessibilityRole="button" accessibilityLabel={inline ? 'Ask Crochet Handy Helper about this pattern' : 'Open Crochet Handy Helper'}
          testID={inline ? 'pattern-ask-helper' : 'crochet-helper-launcher'}
          onPress={() => { if (inline) helperSession.patch({ contextChoice: 'auto' }); helperSession.open(surface); }}
          style={({ pressed }) => [
            inline
              ? [styles.inlineLauncher, { bottom: launcherBottomInset + Spacing.sm }]
              : [styles.launcher, { bottom: Layout.tabBarHeight + Math.max(insets.bottom, Spacing.md) + Spacing.lg }],
            pressed && styles.pressed,
          ]}
        >
          <HelperIcon />
          <Text style={styles.launcherText}>{inline ? 'Ask Helper' : 'Helper'}</Text>
        </Pressable>
      ) : null}
      {open ? (
        <View
          ref={overlayRef}
          style={styles.overlay}
          onLayout={onOverlayLayout}
          accessibilityViewIsModal
          testID="crochet-helper-panel"
        >
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Minimize helper" onPress={onBackdropPress} />
          <Animated.View style={[styles.sheetWrap, { paddingBottom: lift }]}>
            <View style={[styles.panel, {
              width: Math.min(width, 560),
              height: restingHeight,
              flexShrink: 1,
              paddingBottom: keyboardOpen ? Spacing.sm : Math.max(insets.bottom, Spacing.sm),
            }]}>
              <View style={styles.handle} />
              <View style={[styles.header, compact && styles.headerCompact]}>
                <View style={styles.headerIcon}><HelperIcon /></View>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>Helper</Text>
                  {compact ? null : (
                    <Text style={styles.caption} numberOfLines={1}>
                      {helperStatusLabel(modelStatus, state.busy, state.phase)}
                    </Text>
                  )}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={() => { helperSession.clear(); void helperInference.dispose().catch(() => undefined); setCalculator(null); setContextMenu(false); }} style={styles.smallButton}>
                  <NewIcon />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Minimize chat" onPress={closeHelper} style={styles.smallButton}>
                  <CloseIcon />
                </Pressable>
              </View>
              <View style={styles.toolbar}>
                <Pressable accessibilityRole="button" accessibilityLabel="Choose helper context" accessibilityState={{ expanded: contextMenu }}
                  onPress={() => { Keyboard.dismiss(); setContextMenu((value) => !value); }} style={styles.contextChip}>
                  <HelperPatternThumbnail pattern={context.pattern} size={28} />
                  <Text numberOfLines={1} style={styles.contextChipText}>About {about}</Text>
                  <Text style={styles.contextChevron}>▾</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: calculator !== null }} onPress={() => { Keyboard.dismiss(); setCalculator((value) => value ? null : 'yarn'); }} style={[styles.toolButton, calculator ? styles.toolButtonOn : null]}>
                  <Text style={styles.accentText}>Calculators</Text>
                </Pressable>
              </View>
              {contextMenu ? (
                <View style={styles.menu}>
                  {(['auto', 'active', 'none'] as const).map((choice) => {
                    const menuPattern =
                      choice === 'auto'
                        ? pattern
                        : choice === 'active'
                          ? context.project?.patternId
                            ? useCrochetStore.getState().patterns.find((p) => p.id === context.project?.patternId) ?? null
                            : null
                          : null;
                    const menuLabel = choice === 'auto'
                      ? (pattern?.title ?? 'Current screen')
                      : choice === 'active'
                        ? (project?.name ?? 'No active project')
                        : 'General help · clear context';
                    return (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        onPress={() => { helperSession.cancel(); helperSession.patch({ contextChoice: choice }); setContextMenu(false); }}
                        style={[styles.menuItem, state.contextChoice === choice && styles.selected]}
                      >
                        <HelperPatternThumbnail pattern={menuPattern} size={44} />
                        <Text style={[styles.body, styles.menuItemLabel]} numberOfLines={2}>{menuLabel}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <ScrollView
                ref={scroll}
                style={styles.chatScroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                automaticallyAdjustKeyboardInsets={false}
                contentContainerStyle={styles.messages}
                onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !state.busy })}
              >
                {state.messages.length === 0 ? (
                  <WelcomeCard
                    greeting={HELPER_GREETING}
                    context={context}
                    starters={starters}
                    onStarter={(starter) => { void send(starter); }}
                    onTool={(tool) => { Keyboard.dismiss(); setCalculator(tool); }}
                  />
                ) : null}
                {state.messages.map((message, index) => (
                  <HelperMessageBubble
                    key={message.id}
                    message={message}
                    showContext={index === 0 || state.messages[index - 1]?.contextLabel !== message.contextLabel}
                    onPreview={openPreview}
                    onAction={runAction}
                    onAdjust={(operation) => { Keyboard.dismiss(); setCalculator(operation); }}
                  />
                ))}
                {state.busy && state.partial ? (
                  <View style={styles.assistantMessage} testID="crochet-helper-stream">
                    <Text selectable style={styles.body}>{state.partial}</Text>
                  </View>
                ) : null}
                {state.busy && !state.partial ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={Colors.accentPrimary} />
                    <Text accessibilityLiveRegion="polite" style={styles.caption}>{state.phase || 'Thinking…'}</Text>
                  </View>
                ) : null}
                {!state.busy && lastReply?.failed && !lastReply.calculator ? (
                  <Pressable accessibilityRole="button" onPress={retry} style={styles.starter}>
                    <Text style={styles.accentText}>Retry last question</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
              {calculator ? (
                <CalculatorPanel
                  key={calculator}
                  operation={calculator}
                  compact={compact}
                  onChoose={setCalculator}
                  onClose={() => setCalculator(null)}
                  onCalculate={appendCalculation}
                />
              ) : null}
              {state.messages.length === 0 && keyboardOpen && !calculator ? (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.promptStrip}
                >
                  {starters.map((starter) => (
                    <Pressable key={starter} accessibilityRole="button" onPress={() => { void send(starter); }} style={styles.starter}>
                      <Text style={styles.accentText}>{starter}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.composerDock}>
                {keyboardOpen ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Hide keyboard" onPress={() => Keyboard.dismiss()} style={styles.keyboardDismiss}>
                    <Text style={styles.accentText}>Done</Text>
                  </Pressable>
                ) : null}
                <View style={styles.composer}>
                  <TextInput
                    accessibilityLabel="Message Crochet Handy Helper"
                    placeholder={context.pattern ? `Ask about ${context.pattern.title}…` : 'Ask about a stitch, yarn, or pattern…'}
                    placeholderTextColor={Colors.textSecondary}
                    value={state.draft}
                    maxLength={1000}
                    multiline
                    blurOnSubmit={false}
                    underlineColorAndroid={Colors.transparent}
                    onFocus={() => {
                      setComposerFocused(true);
                      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
                    }}
                    onBlur={() => setComposerFocused(false)}
                    onChangeText={(draft) => helperSession.patch({ draft })}
                    style={[styles.input, composerFocused && styles.inputFocused]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={state.busy ? 'Stop helper response' : 'Send message'}
                    disabled={!canSend}
                    onPress={() => { if (state.busy) stopReply(); else void send(); }}
                    style={[styles.send, !canSend && styles.disabled]}
                  >
                    {state.busy ? <StopIcon /> : <SendIcon />}
                  </Pressable>
                </View>
                {compact ? null : (
                  <Text style={styles.privacy}>Stays on this device for this account. Tap New to clear.</Text>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      ) : null}
      {preview ? renderPreview(preview, () => { setPreview(null); helperSession.open(surface); }) : null}
    </>
  );
}

function WelcomeCard({
  greeting,
  context,
  starters,
  onStarter,
  onTool,
}: {
  greeting: string;
  context: HelperContext;
  starters: string[];
  onStarter: (starter: string) => void;
  onTool: (tool: Calculation) => void;
}) {
  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}><HelperIcon /></View>
      <Text style={styles.welcomeTitle}>How can I help?</Text>
      <Text style={styles.body}>{greeting}</Text>
      {context.pattern || context.project ? (
        <View style={styles.contextCard}>
          <HelperPatternThumbnail pattern={context.pattern} size={48} />
          <View style={styles.patternCopy}>
            <Text style={styles.caption}>Talking about</Text>
            <Text style={styles.body} numberOfLines={2}>{contextLabel(context)}</Text>
          </View>
        </View>
      ) : null}
      <Text style={styles.sectionLabel}>Try asking</Text>
      <View style={styles.starters}>
        {starters.map((starter) => (
          <Pressable key={starter} accessibilityRole="button" onPress={() => onStarter(starter)} style={styles.promptChip}>
            <Text style={styles.promptChipText}>{starter}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.sectionLabel}>Quick tools</Text>
      <View style={styles.starters}>
        {QUICK_TOOLS.map((tool) => (
          <Pressable key={tool.id} accessibilityRole="button" onPress={() => onTool(tool.id)} style={styles.starter}>
            <Text style={styles.accentText}>{tool.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function HelperMessageBubble({
  message,
  showContext,
  onPreview,
  onAction,
  onAdjust,
}: {
  message: HelperMessage;
  showContext: boolean;
  onPreview: (pattern: CrochetPattern) => void;
  onAction: (action: HelperAction) => void;
  onAdjust: (operation: Calculation) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={isUser ? styles.userMessage : styles.assistantMessage}>
      {showContext && !isUser ? <Text style={styles.messageLabel}>{message.contextLabel}</Text> : null}
      {message.failed ? <Text style={styles.error}>Couldn’t finish</Text> : null}
      <Text selectable style={styles.body}>{message.text}</Text>
      {message.patterns?.map((p) => <HelperPatternCard key={p.id} pattern={p} onPress={() => onPreview(p)} />)}
      {message.role === 'assistant' && (message.actions?.length || (message.calculated && message.calculator)) ? (
        <View style={styles.starters}>
          {message.actions?.map((action) => (
            <Pressable
              key={action.kind === 'row-note' ? 'row-note' : `stitch-${action.stitches}`}
              accessibilityRole="button"
              onPress={() => onAction(action)}
              style={styles.starter}
            >
              <Text style={styles.accentText}>{action.kind === 'row-note' ? 'Save to Row Note' : `Set Stitch Target (${action.stitches})`}</Text>
            </Pressable>
          ))}
          {message.calculated && message.calculator ? (
            <Pressable accessibilityRole="button" onPress={() => onAdjust(message.calculator!)} style={styles.starter}>
              <Text style={styles.accentText}>Adjust in calculator</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function HelperPatternThumbnail({
  pattern,
  size = 44,
}: {
  pattern: Pick<CrochetPattern, 'thumbnailUrl' | 'videoId' | 'title'> | null;
  size?: number;
}) {
  const candidates = pattern ? patternThumbnailUriCandidates(pattern) : [];
  const sourceKey = `${pattern?.videoId ?? ''}|${pattern?.thumbnailUrl ?? ''}`;
  const [attempt, setAttempt] = useState(0);
  const [seenKey, setSeenKey] = useState(sourceKey);
  if (seenKey !== sourceKey) {
    setSeenKey(sourceKey);
    setAttempt(0);
  }
  const uri = candidates[attempt];
  const radius = Radius.sm;
  return (
    <View style={[styles.patternThumbShell, { width: size, height: size, borderRadius: radius }]}>
      {uri ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri }}
          onError={() => setAttempt((value) => value + 1)}
          resizeMode="cover"
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <HelperIcon compact={size < 48} />
      )}
    </View>
  );
}

function HelperPatternCard({ pattern, onPress }: { pattern: CrochetPattern; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${pattern.title}`} onPress={onPress} style={styles.patternCard}>
      <HelperPatternThumbnail pattern={pattern} size={56} />
      <View style={styles.patternCopy}>
        <Text numberOfLines={2} style={styles.body}>{pattern.title}</Text>
        <Text style={styles.caption}>{pattern.creator} · {pattern.difficulty}</Text>
        <Text style={styles.accentText}>Preview pattern →</Text>
      </View>
    </Pressable>
  );
}

function CalculatorPanel({ operation, compact, onChoose, onClose, onCalculate }: {
  operation: Calculation; compact: boolean; onChoose: (value: Calculation) => void; onClose: () => void;
  onCalculate: (operation: Calculation, values: number[], units: string[]) => void;
}) {
  const fields = CALCULATOR_FIELDS[operation];
  const [values, setValues] = useState<string[]>(() => fields.map((_, i) => operation === 'gauge' && i >= 3 ? (i === 3 ? '1' : '0') : ''));
  const [pair, setPair] = useState(0);
  const [metric, setMetric] = useState(false);
  const [error, setError] = useState('');
  return (
    <View style={[styles.calculator, compact && styles.calculatorCompact]} testID="helper-calculator">
      <View style={styles.calculatorHeader}>
        <Text style={styles.subhead}>Crochet calculators</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calculators" onPress={onClose} style={styles.smallButton}>
          <CloseIcon />
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        style={compact ? styles.calculatorScrollCompact : styles.calculatorScroll}
      >
        <View style={styles.starters}>
          {CALCULATIONS.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: c === operation }} onPress={() => onChoose(c)} style={[styles.starter, c === operation && styles.selected]}>
              <Text style={c === operation ? styles.accentText : styles.caption}>{CALCULATOR_NAMES[c]}</Text>
            </Pressable>
          ))}
        </View>
        {(operation === 'yarn' || operation === 'skeins') ? <Pressable accessibilityRole="button" onPress={() => setMetric((v) => !v)} style={styles.starter}><Text style={styles.accentText}>Length unit: {metric ? 'meters' : 'yards'} · Change</Text></Pressable> : null}
        {operation === 'convert' ? <Pressable accessibilityRole="button" onPress={() => setPair((p) => (p + 1) % CONVERSION_PAIRS.length)} style={styles.starter}><Text style={styles.accentText}>{CONVERSION_PAIRS[pair].join(' → ')} · Change</Text></Pressable> : null}
        {fields.map((field, i) => (
          <View key={field.label} style={styles.field}>
            <Text style={styles.caption}>{metric ? field.label.replace('yards', 'meters').replace('Yards', 'Meters') : field.label}</Text>
            <TextInput
              accessibilityLabel={field.label}
              keyboardType={operation === 'percent' && i === 1 ? 'numbers-and-punctuation' : 'decimal-pad'}
              value={values[i]}
              placeholder={field.example}
              placeholderTextColor={Colors.textTertiary}
              onChangeText={(text) => setValues((old) => old.map((v, index) => index === i ? text : v))}
              style={styles.numberInput}
            />
          </View>
        ))}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => {
          if (values.some((v) => !v.trim() || !/^-?\d*\.?\d+$/.test(v.trim()))) { setError('Fill every field with a number.'); return; }
          const units = operation === 'convert' ? [...CONVERSION_PAIRS[pair]] : [metric ? 'm' : 'yd'];
          setError('');
          Keyboard.dismiss();
          onCalculate(operation, values.map(Number), units);
        }} style={styles.calculateButton}>
          <Text style={styles.sendText}>Calculate</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function HelperIcon({ compact = false }: { compact?: boolean }) {
  const dim = compact ? 18 : 22;
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
      <Path d="M20 11.5a8 8 0 0 1-8 8H8l-4 2v-5a8 8 0 1 1 16-5Z" stroke={Colors.accentPrimary} strokeWidth={1.7} />
      <Circle cx={8} cy={11} r={1} fill={Colors.accentPrimary} />
      <Circle cx={12} cy={11} r={1} fill={Colors.accentPrimary} />
      <Circle cx={16} cy={11} r={1} fill={Colors.accentPrimary} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6 6 18" stroke={Colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function NewIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={Colors.accentPrimary} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V7M6.5 12.5 12 7l5.5 5.5" stroke={Colors.onAccent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function StopIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={Colors.onAccent}>
      <Path d="M7 7h10v10H7z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  launcher: {
    position: 'absolute', right: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.cardSurface,
    borderWidth: 1, borderColor: Colors.accentPrimary, borderRadius: Radius.pill, zIndex: 20, minHeight: 48,
    ...Elevation.accentGlow,
  },
  inlineLauncher: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  launcherText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  overlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: Colors.scrim, zIndex: 100,
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  panel: { backgroundColor: Colors.cardSurface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, overflow: 'hidden', minHeight: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: Radius.pill, backgroundColor: Colors.border, marginTop: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
  headerCompact: { paddingTop: Spacing.xs, paddingBottom: Spacing.xs },
  headerIcon: { width: 36, height: 36, borderRadius: Radius.pill, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: Spacing.xxs },
  title: { ...Typography.headline, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  subhead: { ...Typography.subhead, color: Colors.textPrimary },
  caption: { ...Typography.caption, color: Colors.textSecondary },
  body: { ...Typography.body, color: Colors.textPrimary },
  smallButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  accentText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm },
  contextChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.elevatedControl, paddingHorizontal: Spacing.sm, minHeight: 44 },
  contextChipText: { ...Typography.caption, color: Colors.textPrimary, flex: 1, fontWeight: FontWeight.medium },
  contextChevron: { ...Typography.caption, color: Colors.textSecondary },
  toolButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: Radius.pill, backgroundColor: Colors.elevatedControl },
  toolButtonOn: { backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: Colors.accentPrimary },
  menu: { padding: Spacing.sm, backgroundColor: Colors.elevatedControl, gap: Spacing.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 44, borderRadius: Radius.md },
  menuItemLabel: { flex: 1 },
  patternThumbShell: { backgroundColor: Colors.elevatedControl, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  chatScroll: { flex: 1, minHeight: 0 },
  messages: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  welcome: { gap: Spacing.md, paddingBottom: Spacing.sm },
  welcomeIcon: { width: 52, height: 52, borderRadius: Radius.pill, backgroundColor: Colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { ...Typography.title, color: Colors.textPrimary },
  sectionLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  contextCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.elevatedControl },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  starter: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, minHeight: 44, justifyContent: 'center', backgroundColor: Colors.elevatedControl },
  promptChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, minHeight: 44, justifyContent: 'center', backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: Colors.accentPrimary },
  promptChipText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  promptStrip: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm, flexDirection: 'row', alignItems: 'center' },
  assistantMessage: { padding: Spacing.md, backgroundColor: Colors.elevatedControl, borderRadius: Radius.lg, gap: Spacing.sm, alignSelf: 'flex-start', maxWidth: '92%', borderTopLeftRadius: Radius.sm },
  userMessage: { padding: Spacing.md, backgroundColor: Colors.accentMuted, borderRadius: Radius.lg, gap: Spacing.sm, alignSelf: 'flex-end', maxWidth: '86%', borderTopRightRadius: Radius.sm },
  messageLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  loading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  composerDock: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.xs },
  keyboardDismiss: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  input: { ...Typography.body, color: Colors.textPrimary, backgroundColor: Colors.elevatedControl, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: Colors.border },
  inputFocused: { borderColor: Colors.accentPrimary },
  send: { backgroundColor: Colors.accentPrimary, width: 48, height: 48, borderRadius: Radius.pill, justifyContent: 'center', alignItems: 'center' },
  sendText: { ...Typography.caption, color: Colors.onAccent, fontWeight: FontWeight.bold },
  calculateButton: { backgroundColor: Colors.accentPrimary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm },
  privacy: { ...Typography.caption, color: Colors.textTertiary, paddingBottom: Spacing.xs, paddingHorizontal: Spacing.xs },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  patternCard: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.cardSurface, borderRadius: Radius.md, alignItems: 'center' },
  patternCopy: { flex: 1, gap: Spacing.xs },
  calculator: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.elevatedControl, gap: Spacing.sm, maxHeight: 320 },
  calculatorCompact: { maxHeight: 220 },
  calculatorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calculatorScroll: { maxHeight: 260 },
  calculatorScrollCompact: { maxHeight: 160 },
  field: { gap: Spacing.xs, marginTop: Spacing.sm },
  numberInput: { ...Typography.body, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, minHeight: 44, padding: Spacing.sm, backgroundColor: Colors.cardSurface },
  selected: { borderColor: Colors.accentPrimary, backgroundColor: Colors.accentMuted },
  error: { ...Typography.caption, color: Colors.danger },
});
