type Entry<T> = { value: T; expiresAt: number };
export class ScopedCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  constructor(
    private readonly maxEntries = 100,
    private readonly ttlMs = 30_000
  ) {}
  private key(owner: string, scope: string, key: string) {
    return `${owner}:${scope}:${key}`;
  }
  get(owner: string, scope: string, key: string): T | undefined {
    const id = this.key(owner, scope, key);
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(id);
      return undefined;
    }
    return entry.value;
  }
  set(owner: string, scope: string, key: string, value: T) {
    const id = this.key(owner, scope, key);
    if (!this.entries.has(id) && this.entries.size >= this.maxEntries)
      this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(id, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
  clear(owner?: string) {
    if (!owner) {
      this.entries.clear();
      return;
    }
    for (const key of this.entries.keys())
      if (key.startsWith(`${owner}:`)) this.entries.delete(key);
  }
  get size() {
    return this.entries.size;
  }
}
