import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ActivityIndicator, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { selectActiveProject, useCrochetStore, type CrochetPattern } from '@/store/useCrochetStore';
import { loadRepoPatternCatalog } from '@/utils/patternCatalog';
import { recommendationThumbnail } from '@/utils/catalogPreview';
import {
  CALCULATIONS, CALCULATOR_FIELDS, CALCULATOR_NAMES, CONVERSION_PAIRS,
  calculateCrochet, type Calculation,
} from '@/utils/helper/calculators';
import { contextKey, contextLabel, HELPER_GREETING, type HelperContext, type HelperMessage } from '@/utils/helper/context';
import { answerHelper } from '@/utils/helper/service';
import { helperSession } from '@/utils/helper/session';

type Props = {
  surface?: string;
  pattern?: CrochetPattern | null;
  inline?: boolean;
  renderPreview: (pattern: CrochetPattern, onClose: () => void) => ReactNode;
};
const STARTERS = ['Explain this pattern', 'Calculate stitches', 'Will I have enough yarn?', 'Help me fix a mistake', 'Find beginner coaster patterns'];
let messageSequence = 0;
const id = () => `helper-${Date.now()}-${++messageSequence}`;

/** One conversation, with an overlay rendered inside the currently active native surface. */
export function CrochetHelperHost({ surface = 'main', pattern = null, inline = false, renderPreview }: Props) {
  const state = useSyncExternalStore(helperSession.subscribe, helperSession.snapshot, helperSession.snapshot);
  const account = useCrochetStore((s) => s.account);
  const patterns = useCrochetStore((s) => s.patterns);
  const project = useCrochetStore(selectActiveProject);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardInset();
  const { height, width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const [calculator, setCalculator] = useState<Calculation | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const [preview, setPreview] = useState<CrochetPattern | null>(null);
  const uid = account?.uid ?? null;
  const context = useMemo<HelperContext>(() => {
    if (state.contextChoice === 'none') return { pattern: null, project: null };
    if (state.contextChoice === 'active' || (!pattern && pathname.includes('active'))) {
      return { project, pattern: project?.patternId ? patterns.find((p) => p.id === project.patternId) ?? null : null };
    }
    return { pattern, project: null };
  }, [pattern, project, patterns, pathname, state.contextChoice]);
  const key = contextKey(context);
  const open = state.surface === surface && state.owner === uid && uid !== null;
  const catalog = useMemo(() => {
    const byId = new Map(loadRepoPatternCatalog().map((p) => [p.id, p]));
    for (const p of patterns) byId.set(p.id, p);
    return [...byId.values()];
  }, [patterns]);

  useEffect(() => {
    helperSession.bindOwner(uid);
    return () => { if (surface === 'main') helperSession.bindOwner(null); };
  }, [uid, surface]);
  useEffect(() => {
    return () => { if (helperSession.snapshot().surface === surface) helperSession.close(surface); };
  }, [surface]);
  useEffect(() => {
    if (helperSession.snapshot().surface === surface) helperSession.cancel();
  }, [key, surface]);
  useEffect(() => {
    if (!open) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { helperSession.close(surface); return true; });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') helperSession.close(surface); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('keydown', escape);
    return () => {
      back.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('keydown', escape);
    };
  }, [open, surface]);
  const previousOpen = useRef(false);
  useEffect(() => {
    if (open && !previousOpen.current) requestAnimationFrame(() => input.current?.focus());
    previousOpen.current = open;
  }, [open]);

  const send = async (question = helperSession.snapshot().draft) => {
    const text = question.trim().slice(0, 1000);
    if (!text || helperSession.snapshot().busy) return;
    if (text === 'Calculate stitches') { setCalculator('gauge'); return; }
    if (text === 'Will I have enough yarn?') { setCalculator('yarn'); return; }
    const controller = new AbortController();
    const history = helperSession.snapshot().messages;
    const message: HelperMessage = { id: id(), role: 'user', text, contextKey: key, contextLabel: contextLabel(context) };
    const generation = helperSession.begin(message, () => controller.abort());
    if (generation === null) return;
    try {
      const reply = await answerHelper({ question: text, context, history, catalog, signal: controller.signal,
        onPhase: (phase) => { if (helperSession.current(generation)) helperSession.patch({ phase }); } });
      if (!reply.text) return;
      helperSession.finish(generation, { ...message, ...reply, id: id(), role: 'assistant' });
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
  const appendCalculation = (operation: Calculation, values: number[], units: string[]) => {
    const result = calculateCrochet({ operation, values, units });
    if (state.busy) helperSession.cancel();
    helperSession.append({ id: id(), role: 'assistant', text: `${CALCULATOR_NAMES[operation]}\n\n${result.text}`,
      contextKey: key, contextLabel: contextLabel(context), calculator: operation, failed: !result.ok });
  };
  if (!uid || uid !== state.owner) return null;
  const lastReply = state.messages[state.messages.length - 1];
  return (
    <>
      {!open && !preview && (inline || keyboardHeight === 0) ? (
        <Pressable
          accessibilityRole="button" accessibilityLabel={inline ? 'Ask Crochet Handy Helper about this pattern' : 'Open Crochet Handy Helper'}
          testID={inline ? 'pattern-ask-helper' : 'crochet-helper-launcher'}
          onPress={() => { if (inline) helperSession.patch({ contextChoice: 'auto' }); helperSession.open(surface); }}
          style={({ pressed }) => [inline ? styles.inlineLauncher : styles.launcher,
            !inline && { bottom: Layout.tabBarHeight + Math.max(insets.bottom, Spacing.md) + Spacing.lg }, pressed && styles.pressed]}
        >
          <HelperIcon />
          <Text style={styles.launcherText}>{inline ? 'Ask Helper' : 'Helper'}</Text>
        </Pressable>
      ) : null}
      {open ? (
        <KeyboardAvoidingView style={styles.overlay} behavior={!inline && Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={inline ? insets.top : 0} accessibilityViewIsModal testID="crochet-helper-panel">
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Minimize helper" onPress={() => { Keyboard.dismiss(); helperSession.close(surface); }} />
          <View style={[styles.panel, { maxHeight: '95%',
            height: Math.min(700, height * 0.86), width: Math.min(width, 560), paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Crochet Handy Helper</Text>
                <Text style={styles.caption}>AI assistant · On this device</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={() => { helperSession.clear(); setCalculator(null); setContextMenu(false); }} style={styles.smallButton}>
                <Text style={styles.accentText}>New</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Minimize chat" onPress={() => { Keyboard.dismiss(); helperSession.close(surface); }} style={styles.smallButton}>
                <Text style={styles.body}>−</Text>
              </Pressable>
            </View>
            <View style={styles.toolbar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose helper context" accessibilityState={{ expanded: contextMenu }}
                onPress={() => setContextMenu((value) => !value)} style={styles.contextChip}>
                <Text numberOfLines={1} style={styles.caption}>About: {contextLabel(context)} ▾</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setCalculator((value) => value ? null : 'yarn')} style={styles.smallButton}>
                <Text style={styles.accentText}>Calculators</Text>
              </Pressable>
            </View>
            {contextMenu ? (
              <View style={styles.menu}>
                {(['auto', 'active', 'none'] as const).map((choice) => (
                  <Pressable key={choice} accessibilityRole="button" onPress={() => { helperSession.cancel(); helperSession.patch({ contextChoice: choice }); setContextMenu(false); }} style={styles.menuItem}>
                    <Text style={styles.body}>{choice === 'auto' ? (pattern?.title ?? 'Current screen') : choice === 'active' ? (project?.name ?? 'No active project') : 'General help · clear context'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <ScrollView ref={scroll} style={styles.chatScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}
              onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
              <View style={styles.assistantMessage}><Text selectable style={styles.body}>{HELPER_GREETING}</Text></View>
              {state.messages.length === 0 ? (
                <View style={styles.starters}>{STARTERS.map((starter) => (
                  <Pressable key={starter} accessibilityRole="button" onPress={() => { void send(starter); }} style={styles.starter}>
                    <Text style={styles.accentText}>{starter}</Text>
                  </Pressable>
                ))}</View>
              ) : null}
              {state.messages.map((message) => (
                <View key={message.id} style={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>
                  <Text style={styles.messageLabel}>{message.role === 'user' ? 'You' : 'Crochet Handy Helper'} · {message.contextLabel}</Text>
                  <Text selectable style={styles.body}>{message.text}</Text>
                  {message.patterns?.map((p) => <HelperPatternCard key={p.id} pattern={p} onPress={() => openPreview(p)} />)}
                </View>
              ))}
              {state.busy ? <View style={styles.loading}><ActivityIndicator color={Colors.accentPrimary} /><Text accessibilityLiveRegion="polite" style={styles.caption}>{state.phase}</Text></View> : null}
              {!state.busy && lastReply?.failed && !lastReply.calculator ? <Pressable accessibilityRole="button" onPress={retry} style={styles.starter}><Text style={styles.accentText}>Retry last question</Text></Pressable> : null}
              {calculator ? <CalculatorPanel key={calculator} operation={calculator} onChoose={setCalculator} onCalculate={appendCalculation} /> : null}
              <Text style={styles.caption}>Calculators work without AI. Chat stays in memory and clears when you sign out or start a new conversation.</Text>
            </ScrollView>
            <View style={styles.composer}>
              <TextInput ref={input} accessibilityLabel="Message Crochet Handy Helper" placeholder="Ask about crochet…"
                placeholderTextColor={Colors.textSecondary} value={state.draft} maxLength={1000} multiline
                onChangeText={(draft) => helperSession.patch({ draft })} style={styles.input} />
              <Pressable accessibilityRole="button" accessibilityLabel={state.busy ? 'Stop helper response' : 'Send message'}
                disabled={!state.busy && !state.draft.trim()} onPress={() => { if (state.busy) stopReply(); else void send(); }}
                style={[styles.send, !state.busy && !state.draft.trim() && styles.disabled]}>
                <Text style={styles.sendText}>{state.busy ? 'Stop' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
      {preview ? renderPreview(preview, () => { setPreview(null); helperSession.open(surface); }) : null}
    </>
  );
}

function HelperPatternCard({ pattern, onPress }: { pattern: CrochetPattern; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const uri = recommendationThumbnail(pattern).uri;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${pattern.title}`} onPress={onPress} style={styles.patternCard}>
    {uri && !failed ? <Image source={{ uri }} onError={() => setFailed(true)} style={styles.thumbnail} /> : <View style={styles.thumbnail}><HelperIcon /></View>}
    <View style={styles.patternCopy}><Text numberOfLines={2} style={styles.body}>{pattern.title}</Text><Text style={styles.caption}>{pattern.creator} · {pattern.difficulty}</Text><Text style={styles.accentText}>Preview pattern →</Text></View>
  </Pressable>;
}
function CalculatorPanel({ operation, onChoose, onCalculate }: {
  operation: Calculation; onChoose: (value: Calculation) => void;
  onCalculate: (operation: Calculation, values: number[], units: string[]) => void;
}) {
  const fields = CALCULATOR_FIELDS[operation];
  const [values, setValues] = useState<string[]>(() => fields.map((_, i) => operation === 'gauge' && i >= 3 ? (i === 3 ? '1' : '0') : ''));
  const [pair, setPair] = useState(0);
  const [metric, setMetric] = useState(false);
  const [error, setError] = useState('');
  return <View style={styles.calculator} testID="helper-calculator">
    <Text style={styles.title}>Crochet calculators</Text>
    <View style={styles.starters}>{CALCULATIONS.map((c) => <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: c === operation }} onPress={() => onChoose(c)} style={[styles.starter, c === operation && styles.selected]}><Text style={styles.caption}>{CALCULATOR_NAMES[c]}</Text></Pressable>)}</View>
    {(operation === 'yarn' || operation === 'skeins') ? <Pressable accessibilityRole="button" onPress={() => setMetric((v) => !v)} style={styles.starter}><Text style={styles.accentText}>Length unit: {metric ? 'meters' : 'yards'} · Change</Text></Pressable> : null}
    {operation === 'convert' ? <Pressable accessibilityRole="button" onPress={() => setPair((p) => (p + 1) % CONVERSION_PAIRS.length)} style={styles.starter}><Text style={styles.accentText}>{CONVERSION_PAIRS[pair].join(' → ')} · Change</Text></Pressable> : null}
    {fields.map((field, i) => <View key={field.label} style={styles.field}>
      <Text style={styles.caption}>{metric ? field.label.replace('yards', 'meters').replace('Yards', 'Meters') : field.label}</Text>
      <TextInput accessibilityLabel={field.label} keyboardType={operation === 'percent' && i === 1 ? 'numbers-and-punctuation' : 'decimal-pad'}
        value={values[i]} placeholder={field.example} placeholderTextColor={Colors.textTertiary}
        onChangeText={(text) => setValues((old) => old.map((v, index) => index === i ? text : v))} style={styles.numberInput} />
    </View>)}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => {
      if (values.some((v) => !v.trim() || !/^-?\d*\.?\d+$/.test(v.trim()))) { setError('Fill every field with a number.'); return; }
      const units = operation === 'convert' ? [...CONVERSION_PAIRS[pair]] : [metric ? 'm' : 'yd'];
      setError(''); onCalculate(operation, values.map(Number), units);
    }} style={styles.send}><Text style={styles.sendText}>Calculate</Text></Pressable>
  </View>;
}
export function HelperIcon() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M20 11.5a8 8 0 0 1-8 8H8l-4 2v-5a8 8 0 1 1 16-5Z" stroke={Colors.accentPrimary} strokeWidth={1.7} /><Circle cx={8} cy={11} r={1} fill={Colors.accentPrimary} /><Circle cx={12} cy={11} r={1} fill={Colors.accentPrimary} /><Circle cx={16} cy={11} r={1} fill={Colors.accentPrimary} /></Svg>;
}
const styles = StyleSheet.create({
  launcher: { position: 'absolute', right: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.cardSurface, borderWidth: 1, borderColor: Colors.accentPrimary, borderRadius: Radius.pill, zIndex: 20, minHeight: 48 },
  inlineLauncher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.accentMuted, borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, minHeight: 44 },
  launcherText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: Colors.scrim, justifyContent: 'flex-end', alignItems: 'center', zIndex: 100 },
  panel: { flexShrink: 1, backgroundColor: Colors.cardSurface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerCopy: { flex: 1, gap: Spacing.xs }, title: { ...Typography.headline, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  caption: { ...Typography.caption, color: Colors.textSecondary }, body: { ...Typography.body, color: Colors.textPrimary },
  smallButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  accentText: { ...Typography.caption, color: Colors.accentPrimary, fontWeight: FontWeight.semibold },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  contextChip: { flex: 1, borderRadius: Radius.pill, backgroundColor: Colors.elevatedControl, padding: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  menu: { padding: Spacing.sm, backgroundColor: Colors.elevatedControl }, menuItem: { padding: Spacing.md, minHeight: 44 },
  chatScroll: { flex: 1, minHeight: 0 },
  messages: { padding: Spacing.lg, gap: Spacing.md }, starters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  starter: { padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, minHeight: 44, justifyContent: 'center' },
  assistantMessage: { padding: Spacing.md, backgroundColor: Colors.elevatedControl, borderRadius: Radius.lg, gap: Spacing.sm, alignSelf: 'stretch' },
  userMessage: { padding: Spacing.md, backgroundColor: Colors.accentMuted, borderRadius: Radius.lg, gap: Spacing.sm, alignSelf: 'stretch', marginLeft: Spacing.xxl },
  messageLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  loading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  composer: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, flexDirection: 'row', alignItems: 'flex-end' },
  input: { ...Typography.body, color: Colors.textPrimary, backgroundColor: Colors.elevatedControl, borderRadius: Radius.lg, padding: Spacing.md, flex: 1, minHeight: 48, maxHeight: 120 },
  send: { backgroundColor: Colors.accentPrimary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: Radius.md, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  sendText: { ...Typography.caption, color: Colors.onAccent, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.75 },
  patternCard: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.cardSurface, borderRadius: Radius.md },
  thumbnail: { width: 76, height: 76, borderRadius: Radius.sm, backgroundColor: Colors.elevatedControl, justifyContent: 'center', alignItems: 'center' },
  patternCopy: { flex: 1, gap: Spacing.xs }, calculator: { padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.elevatedControl, gap: Spacing.md },
  field: { gap: Spacing.xs }, numberInput: { ...Typography.body, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, minHeight: 44, padding: Spacing.sm, backgroundColor: Colors.cardSurface },
  selected: { borderColor: Colors.accentPrimary, backgroundColor: Colors.accentMuted }, error: { ...Typography.caption, color: Colors.danger },
});
