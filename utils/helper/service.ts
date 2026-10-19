/** Native boundary. Calculators and catalog lookup work without a language model. */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CrochetPattern } from '@/store/machine';
import { installedVisionPairPaths } from '@/utils/scrapModelFiles';
import { scrapEngineLockKind } from '@/utils/scrapModelTransfer';
import { getVisionModelStatus } from '@/utils/scrapVisionRun';
import { buildHelperMessages, type HelperContext, type HelperMessage } from './context';
import { quickHelperReply, type HelperReply } from './replies';
import { HelperInferenceError, runHelperInference, type HelperRuntime } from './inference';
export { type HelperReply } from './replies';

export async function answerHelper(input: {
  question: string; context: HelperContext; history: HelperMessage[]; catalog: CrochetPattern[];
  signal: AbortSignal; onPhase: (phase: string) => void; onText?: (text: string) => void;
}): Promise<HelperReply> {
  if (input.signal.aborted) return { text: '', failed: true };
  const quick = quickHelperReply(input.question, input.context, input.catalog);
  if (quick) return quick;
  if (Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient') {
    return { text: 'Conversation needs the installed iOS or Android app and its local AI model. Calculators and catalog search work here. Tap Calculators, or ask “Find beginner coaster patterns.”', failed: true };
  }
  if (scrapEngineLockKind()) return { text: 'The local AI is busy with a download, scan, or another request. Try again when it finishes. Calculators are available now.', failed: true };
  let runtime: HelperRuntime;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('llama.rn') as HelperRuntime;
    if (typeof loaded.initLlama !== 'function') throw new Error('unavailable');
    runtime = loaded;
  } catch { return { text: 'The native AI is not linked in this build. Use a new development or preview build; calculators still work.', failed: true }; }
  const path = installedVisionPairPaths(Platform.OS)?.textPath;
  if (!path || getVisionModelStatus().phase !== 'ready') {
    return { text: 'The local AI files are not ready yet. The app prepares them in the background; open Leftover yarn to check progress. Calculators and catalog search work immediately.', failed: true };
  }
  try {
    // 'ready' is published only after existing prefetch verifies the installed pair.
    // Re-inspecting on each message would evict the warm context through the shared lock.
    const text = await runHelperInference({ runtime, modelPath: path, platform: Platform.OS,
      messages: buildHelperMessages(input), signal: input.signal, onPhase: input.onPhase, onText: input.onText });
    const refs = input.context.pattern && /\b(this|pattern|row|round|stitch|hook|yarn)\b/i.test(input.question) ? [input.context.pattern] : [];
    return { text, patterns: refs };
  } catch (error) {
    if (input.signal.aborted || (error instanceof HelperInferenceError && error.code === 'cancelled')) return { text: '', failed: true };
    const code = error instanceof HelperInferenceError ? error.code : 'failed';
    const messages = {
      busy: 'The local AI is busy. Wait for the current scan or download to finish, then retry.',
      timeout: 'The local helper took too long and was stopped. Ask about one short pattern line, or use Calculators for an immediate checked result.',
      context: 'There is too much context for this model. Clear the context chip or paste a shorter pattern instruction.',
      failed: 'The local helper could not finish on this device. Retry, or use the calculators and catalog search.',
      cancelled: 'Stopped.',
    };
    return { text: messages[code], failed: true };
  }
}
