import { VFSNode } from "./structure.ts";

const DEFAULT_MAX_BYTE_SIZE = 50 * 1024 * 1024;
const contentEntries = new Map<string, Uint8Array>();
let currentByteSize = 0;

export const contentCache = {
  get(id: string): Uint8Array | undefined
  {
    const data = contentEntries.get(id);
    if (!data)
    {
      return undefined;
    }

    // Refresh LRU order: remove and re-append to make it "Most Recently Used"
    contentEntries.delete(id);
    contentEntries.set(id, data);
    return data;
  },

  set(id: string, data: Uint8Array): void
  {
    if (data.byteLength > DEFAULT_MAX_BYTE_SIZE)
    {
      return;
    }

    // If the path already exists, subtract its old size before overwriting
    if (contentEntries.has(id))
    {
      currentByteSize -= contentEntries.get(id)!.byteLength;
      contentEntries.delete(id);
    }

    // Evict old entries until we have enough headroom for the new payload
    while (
      currentByteSize + data.byteLength > DEFAULT_MAX_BYTE_SIZE
      && contentEntries.size > 0
    )
    {
      // The first item in the map iterator is the oldest/least recently used
      const oldestKey = contentEntries.keys().next().value;
      if (oldestKey !== undefined)
      {
        const oldestData = contentEntries.get(oldestKey);
        if (oldestData)
        {
          currentByteSize -= oldestData.byteLength;
        }
        contentEntries.delete(oldestKey);
      }
    }

    // Commit to cache storage space allocation
    contentEntries.set(id, data);
    currentByteSize += data.byteLength;
  },

  has(id: string): boolean
  {
    return contentEntries.has(id);
  },

  delete(id: string): void
  {
    const data = contentEntries.get(id);
    if (data)
    {
      currentByteSize -= data.byteLength;
      contentEntries.delete(id);
    }
  },

  clear(): void
  {
    contentEntries.clear();
    currentByteSize = 0;
  },

  // Debug methods for profiling/testing performance bounds
  get sizeInBytes(): number
  {
    return currentByteSize;
  },
  get entryCount(): number
  {
    return contentEntries.size;
  },
};

export type InodeUpdater = (
  currentNode: VFSNode | undefined,
) => VFSNode | undefined;

const inodeEntries = new Map<string, VFSNode>();

export const inodeCache = {
  get(id: string): VFSNode | undefined
  {
    return inodeEntries.get(id);
  },

  set(id: string, valueOrFn: VFSNode | InodeUpdater): void
  {
    if (typeof valueOrFn === "function")
    {
      const current = inodeEntries.get(id);
      const next = valueOrFn(current);

      if (next === undefined)
      {
        inodeEntries.delete(id);
      }
      else
      {
        inodeEntries.set(id, next);
      }
    }
    else
    {
      inodeEntries.set(id, valueOrFn);
    }
  },

  has(id: string): boolean
  {
    return inodeEntries.has(id);
  },

  delete(id: string): boolean
  {
    return inodeEntries.delete(id);
  },

  clear(): void
  {
    inodeEntries.clear();
  },
};
