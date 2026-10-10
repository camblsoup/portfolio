import { VFSNode } from "./structure.ts";

export class ContentCache {
  // Key: file ID, Value: Uint8Array data payload
  private cache = new Map<string, Uint8Array>();
  private currentByteSize = 0;

  constructor(private maxByteSize: number = 50 * 1024 * 1024) {} // Default: 50MB limit

  public get(id: string): Uint8Array | undefined {
    const data = this.cache.get(id);
    if (!data) return undefined;

    // Refresh LRU order: remove and re-append to make it "Most Recently Used"
    this.cache.delete(id);
    this.cache.set(id, data);
    return data;
  }

  public set(id: string, data: Uint8Array): void {
    // If the path already exists, subtract its old size before overwriting
    if (this.cache.has(id)) {
      this.currentByteSize -= this.cache.get(id)!.byteLength;
      this.cache.delete(id);
    }

    // Check if a single file is completely over the maximum allowed size limit
    if (data.byteLength > this.maxByteSize) {
      return; // Do not cache files larger than the entire cache pool
    }

    // Evict old entries until we have enough headroom for the new payload
    while (
      this.currentByteSize + data.byteLength > this.maxByteSize &&
      this.cache.size > 0
    ) {
      // The first item in the map iterator is the oldest/least recently used
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestData = this.cache.get(oldestKey);
        if (oldestData) {
          this.currentByteSize -= oldestData.byteLength;
        }
        this.cache.delete(oldestKey);
      }
    }

    // Commit to cache storage space allocation
    this.cache.set(id, data);
    this.currentByteSize += data.byteLength;
  }

  public has(id: string): boolean {
    return this.cache.has(id);
  }

  public delete(id: string): void {
    const data = this.cache.get(id);
    if (data) {
      this.currentByteSize -= data.byteLength;
      this.cache.delete(id);
    }
  }

  public clear(): void {
    this.cache.clear();
    this.currentByteSize = 0;
  }

  // Debug methods for profiling/testing performance bounds
  public get sizeInBytes(): number {
    return this.currentByteSize;
  }
  public get entryCount(): number {
    return this.cache.size;
  }
}

export type InodeUpdater = (
  currentNode: VFSNode | undefined,
) => VFSNode | undefined;

export class InodeCache {
  private cache = new Map<string, VFSNode>();

  public get(id: string): VFSNode | undefined {
    return this.cache.get(id);
  }

  public set(id: string, valueOrFn: VFSNode | InodeUpdater): void {
    if (typeof valueOrFn === "function") {
      const current = this.cache.get(id);
      const next = valueOrFn(current);

      if (next === undefined) {
        this.cache.delete(id);
      } else {
        this.cache.set(id, next);
      }
    } else {
      this.cache.set(id, valueOrFn);
    }
  }

  public has(id: string): boolean {
    return this.cache.has(id);
  }

  public delete(id: string): boolean {
    return this.cache.delete(id);
  }

  public clear(): void {
    this.cache.clear();
  }
}
