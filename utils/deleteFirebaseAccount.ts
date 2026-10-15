/**
 * Permanently removes a Firebase Auth user and their Firestore document.
 */
import { deleteUser } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';

import { auth, db, isFirebaseConfigured } from '@/utils/firebase';

export type DeleteAccountResult =
  | { status: 'ok' }
  | { status: 'not-configured' }
  | { status: 'not-signed-in' }
  | { status: 'error'; message: string };

export async function deleteFirebaseAccount(): Promise<DeleteAccountResult> {
  if (!isFirebaseConfigured() || !auth || !db) {
    return { status: 'not-configured' };
  }
  const user = auth.currentUser;
  if (!user) {
    return { status: 'not-signed-in' };
  }

  try {
    await deleteDoc(doc(db, 'users', user.uid));
    await deleteUser(user);
    return { status: 'ok' };
  } catch (caught) {
    const code = typeof caught === 'object' && caught && 'code' in caught ? String((caught as { code: string }).code) : '';
    if (code === 'auth/requires-recent-login') {
      return {
        status: 'error',
        message: 'For security, sign out, sign in again, then delete your account.',
      };
    }
    const message = caught instanceof Error ? caught.message : 'Could not delete account. Try again.';
    return { status: 'error', message };
  }
}
