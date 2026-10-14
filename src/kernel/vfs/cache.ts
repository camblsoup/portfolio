import { VFSNode } from "./structure.ts";

const DEFAULT_MAX_BYTE_SIZE = 50 * 1024 * 1024;
const contentEntries = new Map<string, Uint8Array>();
let currentByteSize = 0;

/** LRU cache for binary file contents with a fixed byte capacity. */
export const contentCache = {
  /** Returns cached content and marks it as recently used. */
  get(id: string): Uint8Array | undefined {
    const data = contentEntries.get(id);
    if (!data) return undefined;

    // Refresh LRU order: remove and re-append to make it "Most Recently Used"
    contentEntries.delete(id);
    contentEntries.set(id, data);
    return data;
  },

  /** Stores content and evicts the least recently used entries as needed. */
  set(id: string, data: Uint8Array): void {
    if (data.byteLength > DEFAULT_MAX_BYTE_SIZE) {
      return;
    }

    // If the path already exists, subtract its old size before overwriting
    if (contentEntries.has(id)) {
      currentByteSize -= contentEntries.get(id)!.byteLength;
      contentEntries.delete(id);
    }

    // Evict old entries until we have enough headroom for the new payload
    while (
      currentByteSize + data.byteLength > DEFAULT_MAX_BYTE_SIZE &&
      contentEntries.size > 0
    ) {
      // The first item in the map iterator is the oldest/least recently used
      const oldestKey = contentEntries.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestData = contentEntries.get(oldestKey);
        if (oldestData) {
          currentByteSize -= oldestData.byteLength;
        }
        contentEntries.delete(oldestKey);
      }
    }

    // Commit to cache storage space allocation
    contentEntries.set(id, data);
    currentByteSize += data.byteLength;
  },

  /** Reports whether content is cached for an ID. */
  has(id: string): boolean {
    return contentEntries.has(id);
  },

  /** Removes cached content for an ID. */
  delete(id: string): void {
    const data = contentEntries.get(id);
    if (data) {
      currentByteSize -= data.byteLength;
      contentEntries.delete(id);
    }
  },

  /** Clears all cached content. */
  clear(): void {
    contentEntries.clear();
    currentByteSize = 0;
  },

  // Debug methods for profiling/testing performance bounds
  /** Returns the number of cached content bytes. */
  get sizeInBytes(): number {
    return currentByteSize;
  },
  /** Returns the number of cached content entries. */
  get entryCount(): number {
    return contentEntries.size;
  },
};

/** Applies an immutable update to a cached inode. */
export type InodeUpdater = (
  currentNode: VFSNode | undefined,
) => VFSNode | undefined;

const inodeEntries = new Map<string, VFSNode>();

/** In-memory cache for VFS node metadata keyed by node ID. */
export const inodeCache = {
  /** Returns cached metadata for an ID. */
  get(id: string): VFSNode | undefined {
    return inodeEntries.get(id);
  },

  /** Stores metadata or applies an updater to the current metadata. */
  set(id: string, valueOrFn: VFSNode | InodeUpdater): void {
    if (typeof valueOrFn === "function") {
      const current = inodeEntries.get(id);
      const next = valueOrFn(current);

      if (next === undefined) {
        inodeEntries.delete(id);
      } else {
        inodeEntries.set(id, next);
      }
    } else {
      inodeEntries.set(id, valueOrFn);
    }
  },

  /** Reports whether metadata is cached for an ID. */
  has(id: string): boolean {
    return inodeEntries.has(id);
  },

  /** Removes cached metadata for an ID. */
  delete(id: string): boolean {
    return inodeEntries.delete(id);
  },

  /** Clears all cached metadata. */
  clear(): void {
    inodeEntries.clear();
  },
};
