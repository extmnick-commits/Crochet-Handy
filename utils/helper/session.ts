/** One ephemeral conversation, shared by the tab and native-pattern-modal surfaces. */
import type { HelperMessage } from './context';
export type HelperSessionState = {
  owner: string | null; surface: string | null; messages: HelperMessage[]; draft: string;
  busy: boolean; phase: string; partial: string; generation: number; contextChoice: 'auto' | 'none' | 'active';
};
export class HelperSession {
  private state: HelperSessionState = { owner: null, surface: null, messages: [], draft: '', busy: false, phase: '', partial: '', generation: 0, contextChoice: 'auto' };
  private listeners = new Set<() => void>();
  private stop: (() => void) | null = null;
  snapshot = (): HelperSessionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  patch(patch: Partial<HelperSessionState>): void { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }
  bindOwner(owner: string | null): void {
    if (owner === this.state.owner) return;
    this.cancel();
    this.patch({ owner, surface: null, messages: [], draft: '', contextChoice: 'auto' });
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
  clear(): void { this.cancel(); this.patch({ messages: [], draft: '' }); }
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
}
export const helperSession = new HelperSession();
export function dismissCrochetHelper(surface: string): boolean {
  return helperSession.snapshot().surface === surface && helperSession.close(surface);
}
