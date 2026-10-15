/**
 * Email/password sign-in, account creation, and profile editing (sheet).
 */
import { AuthAccountForm } from '@/components/AuthAccountForm';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCrochetStore } from '@/store/useCrochetStore';

type AuthMode = 'sign-in' | 'create' | 'edit';

type AuthAccountModalProps = {
  visible: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
};

export function AuthAccountModal({ visible, initialMode = 'sign-in', onClose }: AuthAccountModalProps) {
  const account = useCrochetStore((state) => state.account);
  const formKey = visible ? `${initialMode}-${account?.uid ?? 'guest'}` : 'closed';

  return (
    <BottomSheet visible={visible} onClose={onClose} header={null} footer={null}>
      {visible ? (
        <AuthAccountForm
          key={formKey}
          layout="sheet"
          initialMode={initialMode}
          account={account}
          onSuccess={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}
