import * as z from "zod";
import { openDB } from "idb";
import {
  CanonicalPathSchema,
  NodeNameSchema,
  VFSContent,
  VFSContentSchema,
  VFSError,
  VFSNode,
  VFSNodeSchema,
  VFSNodeType,
} from "./structure.ts";
import { contentCache, inodeCache } from "./cache.ts";

export const vfs = {
  async readMetadata(path: string) {
    const id = await resolvePathToId(path);
    return await loadMetadata(id);
  },

  async readContent(path: string) {
    const id = await resolvePathToId(path);
    return await loadContent(id);
  },

  async writeFile(path: string, content: VFSContent) {
    VFSContentSchema.parse(content);

    const { parentId, nodeName, existingId } = await prepareNodeContext(path);
    const contentSize = content.byteLength;
    let node: VFSNode;

    if (existingId) {
      const existingNode = await loadMetadata(existingId);
      if (existingNode.nodeType === VFSNodeType.DIRECTORY) {
        throw new VFSError("EEXIST", `Is a directory: '${nodeName}'`);
      }
      node = { ...existingNode, size: contentSize };
    } else {
      node = {
        id: crypto.randomUUID(),
        parentId,
        name: nodeName,
        nodeType: VFSNodeType.FILE,
        mimeType: "text/plain",
        permissions: { read: true, write: true },
        size: contentSize,
      };
    }

    // Optimistic UI updates
    inodeCache.set(node.id, node);
    contentCache.set(node.id, content);

    if (!existingId) {
      inodeCache.set(parentId, (parent) => {
        if (!parent || parent.nodeType !== VFSNodeType.DIRECTORY) return parent;
        return {
          ...parent,
          children: {
            ...parent.children,
            [nodeName]: node.id,
          },
        };
      });
    }

    // Storage Persistence
    try {
      const updatedParent = inodeCache.get(parentId);

      const db = await dbSingleton;
      const tx = db.transaction(["inodes", "content"], "readwrite");
      tx.objectStore("inodes").put(node, node.id);
      tx.objectStore("content").put(content, node.id);

      if (!existingId) {
        if (updatedParent) {
          tx.objectStore("inodes").put(updatedParent, parentId);
        }
      }
      await tx.done;
      return node;
    } catch (e) {
      console.error(`Critical storage failure writing file '${nodeName}':`, e);
      await Promise.all([
        loadMetadata(node.id, { forceRefresh: true }).catch(),
        loadContent(node.id, { forceRefresh: true }).catch(),
        loadMetadata(parentId, { forceRefresh: true }).catch(),
      ]);
      throw e;
    }
  },

  async createDirectory(path: string): Promise<VFSNode> {
    const normalizedInput = path.endsWith("/") && path !== "/"
      ? path.slice(0, -1)
      : path;

    // Throws if parent path is broken
    const { parentId, nodeName, existingId } = await prepareNodeContext(
      normalizedInput,
    );

    if (existingId) {
      throw new VFSError("EEXIST", `File exists: '${nodeName}'`);
    }

    const node: VFSNode = {
      id: crypto.randomUUID(),
      parentId,
      name: nodeName,
      nodeType: VFSNodeType.DIRECTORY,
      permissions: { read: true, write: true },
      size: 0,
      children: {},
    };

    // Optimistic UI Updates
    inodeCache.set(node.id, node);
    inodeCache.set(parentId, (parent) => {
      if (!parent || parent.nodeType !== VFSNodeType.DIRECTORY) return parent;
      return {
        ...parent,
        children: {
          ...parent.children,
          [nodeName]: node.id,
        },
      };
    });

    // Storage Persistence
    try {
      const updatedParent = inodeCache.get(parentId);

      const db = await dbSingleton;
      const tx = db.transaction(["inodes"], "readwrite");
      tx.objectStore("inodes").put(node, node.id);

      if (updatedParent) tx.objectStore("inodes").put(updatedParent, parentId);

      await tx.done;
      return node;
    } catch (e) {
      console.error(
        `Critical storage failure creating directory '${nodeName}':`,
        e,
      );
      await Promise.all([
        loadMetadata(node.id, { forceRefresh: true }).catch(),
        loadMetadata(parentId, { forceRefresh: true }).catch(),
      ]);
      throw e;
    }
  },

  async delete(path: string) {
    const id = await resolvePathToId(path);
    if (!id) return null;

    const node = await loadMetadata(id);

    if (!node) return;

    inodeCache.delete(node.id);
    contentCache.delete(node.id);

    if (node.parentId) {
      inodeCache.set(
        node.parentId,
        (parentNode) => {
          if (!parentNode || parentNode.nodeType !== VFSNodeType.DIRECTORY) {
            throw new Error("Cannot set parentId to a non directory node");
          }

          const { [node.name]: _, ...remainingChildren } = parentNode.children;

          return {
            ...parentNode,
            children: {
              ...remainingChildren,
            },
          };
        },
      );
    }

    try {
      const db = await dbSingleton;
      const tx = db.transaction(["inodes", "content"], "readwrite");

      tx.objectStore("inodes").delete(node.id);
      tx.objectStore("content").delete(node.id);

      if (node.parentId) {
        const parentNode = inodeCache.get(node.parentId);
        if (!parentNode || parentNode.nodeType !== VFSNodeType.DIRECTORY) {
          throw new Error("Cannot set parentId to a non directory node");
        }

        const { [node.name]: _, ...remainingChildren } = parentNode.children;

        tx.objectStore("inodes").put({
          ...parentNode,
          children: {
            ...remainingChildren,
          },
        }, node.parentId);
      }

      await tx.done;
    } catch (e) {
      console.error(
        `Critical vfs storage failure while writing ${node.name}:`,
        e,
      );

      await Promise.all([
        loadMetadata(node.id, { forceRefresh: true }).catch(),
        loadContent(node.id, { forceRefresh: true }).catch(),
        ...(node.parentId
          ? [
            loadMetadata(node.parentId, { forceRefresh: true }).catch(),
          ]
          : []),
      ]);
    }
  },

  async preLoad(path: string) {
    const id = await resolvePathToId(path);
    if (id) {
      loadMetadata(id);
      loadContent(id);
    }
  },
};

// ――――――――――――――――――――――――――――――
// Helpers
// ――――――――――――――――――――――――――――――

const DB_NAME = "VFS";
const DB_VERSION = 1;

const dbSingleton = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore("inodes");
    db.createObjectStore("content");
  },
});

async function resolvePathToId(path: string): Promise<string> {
  const parts = path.split("/").filter(Boolean);
  let currId = "root";

  if (path === "/" || path === "") return "root";

  for (const part of parts) {
    let currNode = inodeCache.get(currId);

    if (!currNode) {
      currNode = await loadMetadata(currId).catch(() => {
        throw new VFSError(
          "ENOENT",
          `File system integrity error: missing descriptor '${currId}'`,
        );
      });
    }

    // ENOTDIR: Trying to traverse through a file as if it were a folder
    if (currNode.nodeType !== VFSNodeType.DIRECTORY) {
      throw new VFSError("ENOTDIR", `Not a directory: '${currNode.name}'`);
    }

    const nextId = currNode.children?.[part];

    // ENOENT: The exact segment we are looking for doesn't exist
    if (!nextId) {
      throw new VFSError("ENOENT", `No such file or directory: '${part}'`);
    }

    currId = nextId;
  }

  return currId;
}

async function loadMetadata(id: string, options?: { forceRefresh: boolean }) {
  if (inodeCache.has(id) && !options?.forceRefresh) {
    return inodeCache.get(id)!;
  }

  const db = await dbSingleton;
  const node = await db.get("inodes", id);
  if (!node) throw new Error("File not found");

  const validNode = VFSNodeSchema.safeParse(node);

  if (!validNode.success) {
    console.error(
      `Failed to parse node stored at ${id}:`,
      z.treeifyError(validNode.error),
    );
    throw new Error("File system corruption detected.");
  }

  inodeCache.set(id, validNode.data);
  return validNode.data;
}

async function loadContent(id: string, options?: { forceRefresh: boolean }) {
  if (contentCache.has(id) && !options?.forceRefresh) {
    return contentCache.get(id)!;
  }

  const db = await dbSingleton;
  const content = await db.get("content", id);

  const validContent = VFSContentSchema.safeParse(content);

  if (!validContent.success) {
    console.error(
      `Failed to parse content stored at ${id}:`,
      z.treeifyError(validContent.error),
    );
    throw new Error("File system corruption detected.");
  }

  contentCache.set(id, validContent.data);
  return validContent.data;
}

async function prepareNodeContext(path: string) {
  const validatedPath = CanonicalPathSchema.parse(path);

  if (validatedPath === "/") {
    throw new VFSError(
      "EEXIST",
      "Path conflict: Cannot modify or overwrite the root directory '/'.",
    );
  }

  const lastSlashIndex = validatedPath.lastIndexOf("/");
  const parentPath = lastSlashIndex === 0
    ? "/"
    : validatedPath.slice(0, lastSlashIndex);
  const nodeName = NodeNameSchema.parse(
    validatedPath.slice(lastSlashIndex + 1),
  );

  // Resolve parent directory. If a mid-path segment is missing,
  // resolvePathToId throws the exact ENOENT / ENOTDIR error for us.
  const parentId = await resolvePathToId(parentPath);
  const parentNode = await loadMetadata(parentId);

  // Double check parent constraints (should already be covered by resolvePathToId, but safe)
  if (parentNode.nodeType !== VFSNodeType.DIRECTORY) {
    throw new VFSError("ENOTDIR", `Not a directory: '${parentPath}'`);
  }

  // Check if the final target already exists in this directory
  const existingId = parentNode.children?.[nodeName] || null;

  return {
    parentId,
    parentNode,
    nodeName,
    existingId,
  };
}
