/** Space scraper requests, including individual retries, when configured by the workflow. */
let nextRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

export async function waitForGeminiRequest(): Promise<void> {
  const configured = Number(process.env.SCRAPE_GEMINI_MIN_INTERVAL_MS ?? 0);
  const interval = Number.isFinite(configured) ? Math.max(0, configured) : 0;
  if (!interval) return;
  const turn = queue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + interval;
  });
  queue = turn.catch(() => undefined);
  await turn;
}

export function isGeminiRateLimitError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'status' in error && error.status === 429;
}

/** Timeouts and transient Gemini/OpenAI transport failures (safe to retry). */
export function isRetryableGeminiTransportError(error: unknown): boolean {
  if (isGeminiRateLimitError(error)) return false;
  if (error instanceof Error && /timed out/i.test(error.message)) return true;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status);
    if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  }
  return false;
}
