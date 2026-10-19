/** Native boundary. Calculators and catalog lookup work without a language model. */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { CrochetPattern } from '@/store/machine';
import { installedVisionPairPaths } from '@/utils/scrapModelFiles';
import { scrapEngineLockKind } from '@/utils/scrapModelTransfer';
import { getVisionModelStatus, ensureVisionPair } from '@/utils/scrapVisionRun';
import { calculateCrochet } from './calculators';
import { buildHelperMessages, parseHelperPlan, searchHelperPatterns, type HelperContext, type HelperMessage } from './context';
import { HelperInferenceError, runHelperInference, type HelperRuntime } from './inference';

export type HelperReply = { text: string; patterns?: CrochetPattern[]; failed?: boolean };
export async function answerHelper(input: {
  question: string; context: HelperContext; history: HelperMessage[]; catalog: CrochetPattern[];
  signal: AbortSignal; onPhase: (phase: string) => void;
}): Promise<HelperReply> {
  const candidates = searchHelperPatterns(input.question, input.catalog);
  // Catalog searches have a useful, honest offline path without model loading.
  if (/\b(find|recommend|search|show me)\b/i.test(input.question) && /\b(pattern|project|tutorial|coaster|bag|blanket|amigurumi)\b/i.test(input.question)) {
    return candidates.length
      ? { text: 'Here are matching patterns from the local catalog. Check each tutorial’s materials and gauge before starting.', patterns: candidates }
      : { text: 'No close catalog match yet. Try a project type such as coaster, bag, or amigurumi, plus your yarn weight or skill level.' };
  }
  if (input.signal.aborted) return { text: '', failed: true };
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
  let path = installedVisionPairPaths(Platform.OS)?.textPath;
  if (getVisionModelStatus().phase !== 'ready') {
    return { text: 'The local AI files are not ready yet. The app prepares them in the background; open Leftover yarn to check progress. Calculators and catalog search work immediately.', failed: true };
  }
  try {
    // Reuse readiness/receipt verification rather than creating another model download.
    input.onPhase('Checking installed helper…');
    const paths = await ensureVisionPair();
    path = paths.textPath;
    if (input.signal.aborted) return { text: '', failed: true };
    const text = await runHelperInference({ runtime, modelPath: path, platform: Platform.OS,
      messages: buildHelperMessages({ ...input, candidates }), signal: input.signal, onPhase: input.onPhase });
    const plan = parseHelperPlan(text, candidates);
    if (!plan) return { text: 'The local helper returned an incomplete reply. Try a shorter question, paste one pattern line, or use a calculator.', failed: true };
    if (plan.action === 'calculate' && plan.operation !== 'none') {
      const result = calculateCrochet({ operation: plan.operation, values: plan.values, units: plan.units });
      return { text: result.text, failed: !result.ok };
    }
    const patterns = plan.patternIds.map((id) => candidates.find((p) => p.id === id)!).filter(Boolean);
    const refs = input.context.pattern && /\b(this|pattern|row|round|stitch|hook|yarn)\b/i.test(input.question) ? [input.context.pattern] : [];
    return { text: plan.answer.trim() || 'Please paste the instruction or provide the inputs you want help with.', patterns: patterns.length ? patterns : refs };
  } catch (error) {
    if (input.signal.aborted || (error instanceof HelperInferenceError && error.code === 'cancelled')) return { text: '', failed: true };
    const code = error instanceof HelperInferenceError ? error.code : 'failed';
    const messages = {
      busy: 'The local AI is busy. Wait for the current scan or download to finish, then retry.',
      timeout: 'The local helper took too long and was stopped. Try a shorter question; calculators still work.',
      context: 'There is too much context for this model. Clear the context chip or paste a shorter pattern instruction.',
      failed: 'The local helper could not finish on this device. Retry, or use the calculators and catalog search.',
      cancelled: 'Stopped.',
    };
    return { text: messages[code], failed: true };
  }
}
