import { MeIcon } from '@/components/navigation/TabIcons';
import { EmptyStateCard, ScreenScaffold } from '@/components/ui/ScreenScaffold';
import { Colors } from '@/constants/BambuTheme';

export default function MeScreen() {
  return (
    <ScreenScaffold title="Me" subtitle="Profile & Yarn Stash">
      <EmptyStateCard
        icon={<MeIcon focused color={Colors.accentPrimary} size={30} />}
        title="Your stash is empty"
        body="Your profile, finished makes, and a filament-style yarn stash inventory will appear here."
      />
    </ScreenScaffold>
  );
}
