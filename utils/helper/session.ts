/** One conversation per account, shared by the tab and native-pattern-modal surfaces. */
import type { HelperMessage } from './context';

const STORAGE_PREFIX = 'crochet-helper-messages:';
const PERSIST_LIMIT = 20;

export type HelperStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type HelperSessionState = {
  owner: string | null; surface: string | null; messages: HelperMessage[]; draft: string;
  busy: boolean; phase: string; partial: string; generation: number; contextChoice: 'auto' | 'none' | 'active';
};

const storageKey = (owner: string) => `${STORAGE_PREFIX}${owner}`;

function parseMessages(raw: string | null): HelperMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const message = item as Partial<HelperMessage>;
      if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string' || typeof message.id !== 'string') return [];
      return [{
        id: message.id,
        role: message.role,
        text: message.text.slice(0, 4000),
        contextKey: typeof message.contextKey === 'string' ? message.contextKey : 'general|none',
        contextLabel: typeof message.contextLabel === 'string' ? message.contextLabel : 'General crochet help',
        patterns: Array.isArray(message.patterns) ? message.patterns : undefined,
        calculator: message.calculator,
        calculated: message.calculated === true,
        actions: Array.isArray(message.actions) ? message.actions : undefined,
        failed: message.failed === true,
      }];
    }).slice(-PERSIST_LIMIT);
  } catch {
    return [];
  }
}

export class HelperSession {
  private state: HelperSessionState = { owner: null, surface: null, messages: [], draft: '', busy: false, phase: '', partial: '', generation: 0, contextChoice: 'auto' };
  private listeners = new Set<() => void>();
  private stop: (() => void) | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;
  private loadGeneration = 0;
  constructor(private storage: HelperStorage | null = null, private debounceMs = 400) {}
  snapshot = (): HelperSessionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  patch(patch: Partial<HelperSessionState>): void {
    const previous = this.state.messages;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
    if (!this.hydrating && patch.messages && patch.messages !== previous) this.queuePersist();
  }
  bindOwner(owner: string | null): void {
    if (owner === this.state.owner) return;
    this.cancel();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const previous = this.state.owner;
    const previousMessages = this.state.messages.slice(-PERSIST_LIMIT);
    if (previous && owner !== null && previousMessages.length > 0) {
      void this.storage?.setItem(storageKey(previous), JSON.stringify(previousMessages)).catch(() => undefined);
    }
    this.hydrating = true;
    this.patch({ owner, surface: null, messages: [], draft: '', contextChoice: 'auto' });
    this.hydrating = false;
    this.loadGeneration += 1;
    if (previous && owner === null) void this.storage?.removeItem(storageKey(previous)).catch(() => undefined);
    if (owner) void this.hydrate(owner, this.loadGeneration);
  }
  open(surface: string): void { this.patch({ surface }); }
  close(surface?: string): boolean {
    if (surface && surface !== this.state.surface) return false;
    this.cancel(); this.patch({ surface: null }); return true;
  }
  cancel(): void {
    this.stop?.(); this.stop = null;
    this.patch({ generation: this.state.generation + 1, busy: false, phase: '', partial: '' });
  }
  clear(): void {
    this.cancel();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const owner = this.state.owner;
    this.hydrating = true;
    this.patch({ messages: [], draft: '' });
    this.hydrating = false;
    if (owner) void this.storage?.removeItem(storageKey(owner)).catch(() => undefined);
  }
  begin(message: HelperMessage, stop: () => void): number | null {
    if (this.state.busy) return null;
    const id = this.state.generation + 1;
    this.stop = stop;
    this.patch({ messages: [...this.state.messages, message].slice(-40), draft: '', busy: true, generation: id, phase: 'Working…', partial: '' });
    return id;
  }
  current(id: number): boolean { return this.state.generation === id && this.state.busy; }
  stream(id: number, text: string): void {
    if (this.current(id)) this.patch({ partial: text });
  }
  finish(id: number, message: HelperMessage): boolean {
    if (!this.current(id)) return false;
    this.stop = null;
    this.patch({ messages: [...this.state.messages, message].slice(-40), busy: false, phase: '', partial: '' });
    return true;
  }
  append(message: HelperMessage): void { this.patch({ messages: [...this.state.messages, message].slice(-40) }); }
  private queuePersist(): void {
    const owner = this.state.owner;
    if (!owner || !this.storage) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const messages = this.state.messages.slice(-PERSIST_LIMIT);
    this.persistTimer = setTimeout(() => {
      void this.storage?.setItem(storageKey(owner), JSON.stringify(messages)).catch(() => undefined);
    }, this.debounceMs);
  }
  private async hydrate(owner: string, generation: number): Promise<void> {
    let raw: string | null = null;
    try { raw = (await this.storage?.getItem(storageKey(owner))) ?? null; } catch { return; }
    if (generation !== this.loadGeneration || this.state.owner !== owner) return;
    if (this.state.busy || this.state.messages.length > 0) return;
    const messages = parseMessages(raw);
    if (messages.length === 0) return;
    this.hydrating = true;
    this.patch({ messages });
    this.hydrating = false;
  }
}
export const helperSession = new HelperSession();
export function dismissCrochetHelper(surface: string): boolean {
  return helperSession.snapshot().surface === surface && helperSession.close(surface);
}
