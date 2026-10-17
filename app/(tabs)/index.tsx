/**
 * Patterns — the Bambu Handy "Models" tab, retargeted at crochet.
 *
 * Search, category chips, and the filter drawer all narrow the same local
 * library. For You reverses library order so a pattern you just saved lands
 * at the top; Trending sorts by a stable like count.
 */
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AddPatternModal } from '@/components/AddPatternModal';
import { PatternFeedCard } from '@/components/PatternFeedCard';
import { PatternDetailSheet } from '@/components/PatternDetailSheet';
import { Colors, FontFamily, FontWeight, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useCrochetStore, YARN_WEIGHTS, type CrochetPattern, type YarnWeight } from '@/store/useCrochetStore';
import {
  formatHookSize,
  matchesPatternCategory,
  packMasonryColumns,
  MASONRY_TEXT_BLOCK,
  matchesPatternQuery,
  matchesPatternTagFilter,
  normalizePatternTag,
  patternFeedCategories,
  sortPatternsForCategory,
  yarnWeightMeta,
  type PatternCategoryId,
} from '@/utils/patternDisplay';
import { holidayEmptyState, isHolidayTopicId } from '@/utils/holidayTopics';
import { isEnglishFeedPattern } from '@/utils/patternEnglishFilter';

export default function PatternsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ tag?: string }>();
  const patterns = useCrochetStore((state) => state.patterns);
  const refreshPatternCatalog = useCrochetStore((state) => state.refreshPatternCatalog);

  const [contentWidth, setContentWidth] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [category, setCategory] = useState<PatternCategoryId>('for-you');
  const [yarnFilters, setYarnFilters] = useState<YarnWeight[]>([]);
  const [hookFilters, setHookFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtersActive = yarnFilters.length > 0 || hookFilters.length > 0 || tagFilter != null;

  useEffect(() => {
    const raw = routeParams.tag;
    const next = typeof raw === 'string' ? normalizePatternTag(raw) : '';
    if (!next) return;
    setTagFilter(next);
    setCategory('for-you');
    setSelectedId(null);
    router.setParams({ tag: undefined });
  }, [routeParams.tag, router]);

  const categories = useMemo(() => patternFeedCategories(), []);

  useEffect(() => {
    if (!categories.some((item) => item.id === category)) {
      setCategory('for-you');
    }
  }, [categories, category]);

  const visiblePatterns = useMemo(() => {
    const matched = patterns.filter(
      (pattern) =>
        isEnglishFeedPattern({
          title: pattern.title,
          creator: pattern.creator,
        }) &&
        matchesPatternCategory(pattern, category) &&
        matchesPatternQuery(pattern, query) &&
        matchesPatternTagFilter(pattern, tagFilter) &&
        matchesFacets(pattern, yarnFilters, hookFilters),
    );
    return sortPatternsForCategory(matched, category);
  }, [patterns, category, query, tagFilter, yarnFilters, hookFilters]);

  const innerWidth = Math.max(0, contentWidth - insets.left - insets.right);
  const columnWidth = Math.floor((innerWidth - Layout.screenGutter * 2 - Layout.cardGap) / 2);
  const columns =
    columnWidth > 0 ? packMasonryColumns(visiblePatterns, columnWidth, MASONRY_TEXT_BLOCK, Spacing.md) : [[], []];

  const onSelectCategory = (next: PatternCategoryId) => {
    if (next !== category) tick();
    setCategory(next);
  };

  const onBrowseTag = useCallback((tag: string) => {
    const normalized = normalizePatternTag(tag);
    if (!normalized) return;
    setSelectedId(null);
    setTagFilter(normalized);
    setCategory('for-you');
    setQuery('');
    tick();
  }, []);

  const onRefreshPatterns = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshPatternCatalog();
      tick();
    } finally {
      setRefreshing(false);
    }
  }, [refreshPatternCatalog]);

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}
      onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filters"
          accessibilityState={{ expanded: filtersOpen }}
          testID="pattern-filter"
          hitSlop={Layout.hitSlop}
          onPress={() => setFiltersOpen(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, webCursor]}
        >
          <FilterIcon color={filtersActive ? Colors.accentPrimary : Colors.textPrimary} />
          {filtersActive && <View style={styles.filterDot} />}
        </Pressable>

        {Platform.OS === 'web' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh patterns"
            accessibilityState={{ busy: refreshing }}
            testID="pattern-refresh"
            hitSlop={Layout.hitSlop}
            disabled={refreshing}
            onPress={() => void onRefreshPatterns()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, webCursor]}
          >
            <RefreshIcon color={Colors.textPrimary} />
          </Pressable>
        )}

        <View style={styles.searchPill}>
          <SearchIcon color={Colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search patterns"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Search patterns"
            testID="pattern-search"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={Colors.accentPrimary}
            underlineColorAndroid="transparent"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={Layout.hitSlop} onPress={() => setQuery('')} style={webCursor}>
              <Text style={styles.clearGlyph}>×</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save a YouTube pattern"
          testID="pattern-add"
          onPress={() => setAddOpen(true)}
          style={({ pressed }) => [styles.plusButton, pressed && styles.pressed, webCursor]}
        >
          <PlusIcon color={Colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {categories.map((item) => {
          const selected = item.id === category;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              testID={`category-${item.id}`}
              onPress={() => onSelectCategory(item.id)}
              style={({ pressed }) => [styles.categoryTab, pressed && styles.pressed, webCursor]}
            >
              <Text style={[styles.categoryLabel, selected && styles.categoryLabelActive]}>{item.label}</Text>
              <View style={[styles.categoryIndicator, selected && styles.categoryIndicatorActive]} />
            </Pressable>
          );
        })}
      </ScrollView>

      {tagFilter ? (
        <View style={styles.tagFilterBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear tag filter ${tagFilter}`}
            onPress={() => {
              tick();
              setTagFilter(null);
            }}
            style={({ pressed }) => [styles.tagFilterChip, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.tagFilterHash}>#</Text>
            <Text style={styles.tagFilterLabel}>{tagFilter}</Text>
            <Text style={styles.tagFilterClear}>×</Text>
          </Pressable>
          <Text style={styles.tagFilterMeta}>
            {visiblePatterns.length} pattern{visiblePatterns.length === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.feedScroll}
        contentContainerStyle={[styles.feed, visiblePatterns.length === 0 && styles.feedEmpty]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshPatterns}
            tintColor={Colors.accentPrimary}
            colors={[Colors.accentPrimary]}
            progressBackgroundColor={Colors.backgroundPrimary}
          />
        }
      >
        {visiblePatterns.length === 0 ? (
          <EmptyFeed category={category} query={query} tagFilter={tagFilter} filtering={filtersActive} />
        ) : (
          <View style={styles.masonry}>
            {columns.map((column, columnIndex) => (
              <View key={columnIndex} style={[styles.column, { width: columnWidth }]}>
                {column.map(({ pattern, imageHeight }) => (
                  <PatternFeedCard
                    key={pattern.id}
                    pattern={pattern}
                    imageHeight={imageHeight}
                    onPress={() => {
                      tick();
                      setSelectedId(pattern.id);
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <FilterDrawer
        visible={filtersOpen}
        patterns={patterns}
        yarnFilters={yarnFilters}
        hookFilters={hookFilters}
        onClose={() => setFiltersOpen(false)}
        onToggleYarn={(weight) => setYarnFilters((current) => toggle(current, weight))}
        onToggleHook={(hook) => setHookFilters((current) => toggle(current, hook))}
        onClear={() => {
          setYarnFilters([]);
          setHookFilters([]);
        }}
      />

      <AddPatternModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(patternId) => {
          setCategory('for-you');
          setQuery('');
          setYarnFilters([]);
          setHookFilters([]);
          const { patterns, createProject } = useCrochetStore.getState();
          const pattern = patterns.find((item) => item.id === patternId);
          if (!pattern) return;
          createProject({ name: pattern.title, patternId: pattern.id });
          router.navigate('/active');
        }}
      />

      <PatternDetailSheet
        patternId={selectedId}
        onClose={() => setSelectedId(null)}
        onPatternChange={setSelectedId}
        onTagPress={onBrowseTag}
      />
    </View>
  );
}

function EmptyFeed({
  category,
  query,
  tagFilter,
  filtering,
}: {
  category: PatternCategoryId;
  query: string;
  tagFilter: string | null;
  filtering: boolean;
}) {
  const copy = emptyCopy(category, query, tagFilter, filtering);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
    </View>
  );
}

function FilterDrawer({
  visible,
  patterns,
  yarnFilters,
  hookFilters,
  onClose,
  onToggleYarn,
  onToggleHook,
  onClear,
}: {
  visible: boolean;
  patterns: CrochetPattern[];
  yarnFilters: YarnWeight[];
  hookFilters: string[];
  onClose: () => void;
  onToggleYarn: (weight: YarnWeight) => void;
  onToggleHook: (hook: string) => void;
  onClear: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const drawerWidth = Math.min(340, Math.round(width * 0.86));
  const hooks = uniqueHookSizes(patterns);
  const filtering = yarnFilters.length > 0 || hookFilters.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.drawerRoot, { height }]}>
        <Pressable accessibilityLabel="Close filters" style={styles.scrim} onPress={onClose} />
        <View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              height,
              paddingTop: insets.top + Spacing.xl,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <View style={styles.drawerHeader}>
            <Text role="heading" aria-level={2} style={styles.drawerTitle}>
              Filters
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" disabled={!filtering} onPress={onClear} style={webCursor}>
              <Text style={[styles.clearFilters, !filtering && styles.clearFiltersDisabled]}>Clear</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerBody}>
            <Text style={styles.drawerSection}>Yarn weight</Text>
            <View style={styles.chips}>
              {YARN_WEIGHTS.map((weight) => {
                const meta = yarnWeightMeta(weight);
                const selected = yarnFilters.includes(weight);
                return (
                  <Pressable
                    key={weight}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onToggleYarn(weight)}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {meta.label} {meta.number}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.drawerSection}>Hook size</Text>
            {hooks.length === 0 ? (
              <Text style={styles.drawerEmpty}>Save a pattern with a hook size to filter by it.</Text>
            ) : (
              <View style={styles.chips}>
                {hooks.map((hook) => {
                  const selected = hookFilters.includes(hook);
                  return (
                    <Pressable
                      key={hook}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => onToggleHook(hook)}
                      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed, webCursor]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{hook}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show patterns"
            onPress={onClose}
            style={({ pressed }) => [styles.done, pressed && styles.pressed, webCursor]}
          >
            <Text style={styles.doneText}>Show patterns</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FilterIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7.5 H20" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M4 12 H20" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M4 16.5 H20" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={9} cy={7.5} r={2.2} fill={Colors.backgroundPrimary} stroke={color} strokeWidth={1.7} />
      <Circle cx={15} cy={12} r={2.2} fill={Colors.backgroundPrimary} stroke={color} strokeWidth={1.7} />
      <Circle cx={8} cy={16.5} r={2.2} fill={Colors.backgroundPrimary} stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.25} stroke={color} strokeWidth={1.8} />
      <Path d="M15.8 15.8 L20 20" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5 V19" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M5 12 H19" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function RefreshIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="M20 4v6h-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function matchesFacets(pattern: CrochetPattern, yarnFilters: YarnWeight[], hookFilters: string[]): boolean {
  if (yarnFilters.length > 0 && !yarnFilters.includes(pattern.yarnWeight)) return false;
  if (hookFilters.length > 0 && !hookFilters.includes(formatHookSize(pattern.hookSize))) return false;
  return true;
}

function uniqueHookSizes(patterns: CrochetPattern[]): string[] {
  const hooks = new Set<string>();
  for (const pattern of patterns) {
    const label = formatHookSize(pattern.hookSize);
    if (label !== '—') hooks.add(label);
  }
  return [...hooks].sort((a, b) => parseFloat(a) - parseFloat(b));
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function emptyCopy(
  category: PatternCategoryId,
  query: string,
  tagFilter: string | null,
  filtering: boolean,
): { title: string; body: string } {
  const trimmed = query.trim();
  if (trimmed) return { title: 'No matches', body: `Nothing in your library matches “${trimmed}”.` };
  if (tagFilter) {
    return {
      title: 'No matches',
      body: `No patterns are tagged #${tagFilter} yet. Try another topic from a pattern detail screen.`,
    };
  }
  if (filtering) return { title: 'No matches', body: 'Try clearing the yarn, hook, or topic filters.' };
  if (isHolidayTopicId(category)) {
    return holidayEmptyState(category);
  }
  if (category === 'amigurumi') {
    return { title: 'No amigurumi yet', body: 'Patterns tagged amigurumi or plush show up here.' };
  }
  if (category === 'wearables') {
    return { title: 'No wearables yet', body: 'Cardigans, hats, and other wearables show up here.' };
  }
  return { title: 'No patterns yet', body: 'Save a YouTube tutorial with the + button.' };
}

function tick() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  searchPill: {
    flex: 1,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.md,
    paddingRight: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingVertical: 0,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  clearGlyph: {
    color: Colors.textSecondary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: FontWeight.medium,
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  categoryScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryContent: {
    paddingHorizontal: Layout.screenGutter,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.xl,
    alignItems: 'center',
  },
  categoryTab: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xxs,
  },
  categoryLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  categoryLabelActive: {
    color: Colors.accentPrimary,
  },
  categoryIndicator: {
    width: 18,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.transparent,
  },
  categoryIndicatorActive: {
    backgroundColor: Colors.accentPrimary,
    ...Platform.select({
      web: { boxShadow: '0 0 8px rgba(0, 230, 118, 0.9)' },
      default: {
        shadowColor: Colors.accentPrimary,
        shadowOpacity: 0.95,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
      },
    }),
  },
  tagFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.sm,
  },
  tagFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  tagFilterHash: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.bold,
  },
  tagFilterLabel: {
    ...Typography.caption,
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  tagFilterClear: {
    ...Typography.label,
    color: Colors.accentPrimary,
    marginLeft: Spacing.xs,
  },
  tagFilterMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  feedScroll: {
    flex: 1,
  },
  feed: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.xxxl,
  },
  feedEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Layout.cardGap,
  },
  column: {
    gap: Layout.cardGap,
  },
  card: {
    backgroundColor: Colors.cardSurface,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  cardImageWrap: {
    backgroundColor: Colors.elevatedControl,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentPrimary,
  },
  badgeText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: FontWeight.bold,
    color: Colors.onAccent,
  },
  cardTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    minHeight: 36,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm + 2,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.textPrimary,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: FontWeight.bold,
  },
  creator: {
    ...Typography.caption,
    flex: 1,
    color: Colors.textSecondary,
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likeCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  likeCountOn: {
    color: Colors.accentPrimary,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
  },
  emptyTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...Typography.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  drawerRoot: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.scrim,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: Colors.cardSurface,
    paddingHorizontal: Spacing.lg,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  drawerTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  clearFilters: {
    ...Typography.label,
    color: Colors.accentPrimary,
  },
  clearFiltersDisabled: {
    color: Colors.textTertiary,
  },
  drawerScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  drawerBody: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  drawerSection: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  drawerEmpty: {
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
  done: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  doneText: {
    ...Typography.label,
    color: Colors.onAccent,
  },
  pressed: {
    opacity: 0.72,
  },
});
