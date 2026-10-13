import { PatternsIcon } from '@/components/navigation/TabIcons';
import { EmptyStateCard, ScreenScaffold } from '@/components/ui/ScreenScaffold';
import { Colors } from '@/constants/BambuTheme';

export default function PatternsScreen() {
  return (
    <ScreenScaffold title="Patterns" subtitle="Discover, save, and remix crochet patterns">
      <EmptyStateCard
        icon={<PatternsIcon focused color={Colors.accentPrimary} size={30} />}
        title="Pattern feed coming soon"
        body="A Bambu-style masonry feed of patterns — For You, Trending, and Following — will live here."
      />
    </ScreenScaffold>
  );
}
