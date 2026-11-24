import { openDB } from "idb";
import * as z from "zod";
import {
  createProcessContext,
  FileSystemAction,
  FileSystemGrant,
  ProcessContext,
} from "../process-context.ts";
import { contentCache, inodeCache } from "./cache.ts";
import {
  CanonicalPathSchema,
  NodeNameSchema,
  VFSContent,
  VFSContentSchema,
  VFSDirectoryNode,
  VFSError,
  VFSNode,
  VFSNodeSchema,
  VFSNodeType,
} from "./structure.ts";

export type VFSChangeListener = (path: string) => void;

const changeListeners = new Set<VFSChangeListener>();

export interface ProcessFileSystem
{
  readMetadata(path: string): Promise<VFSNode>;
  readContent(path: string): Promise<Uint8Array>;
  listDirectory(path: string): Promise<VFSNode[]>;
  writeFile(path: string, content: VFSContent, mimeType?: string): Promise<VFSNode>;
  createDirectory(path: string): Promise<VFSNode>;
  delete(path: string): Promise<void | null>;
  move(sourcePath: string, destinationPath: string): Promise<VFSNode>;
  move(sourcePath: string, destinationPath: string): Promise<VFSNode>;
}

export const vfs = {
  subscribe(listener: VFSChangeListener): () => void
  {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  async ensureRoot(): Promise<VFSDirectoryNode>
  {
    const db = await dbSingleton;
    const tx = db.transaction("inodes", "readwrite");
    const existing = await tx.objectStore("inodes").get("root");

    let root: VFSDirectoryNode;
    if (existing === undefined)
    {
      root = {
        id: "root",
        name: "root",
        nodeType: VFSNodeType.DIRECTORY,
        permissions: { read: true, write: true },
        size: 0,
        children: {},
      };
      tx.objectStore("inodes").put(root, "root");
    }
    else
    {
      const validNode = VFSNodeSchema.safeParse(existing);
      if (
        !validNode.success
        || validNode.data.id !== "root"
        || validNode.data.nodeType !== VFSNodeType.DIRECTORY
      )
      {
        await tx.done;
        throw new Error("File system root is corrupt or is not a directory.");
      }
      root = validNode.data;
    }

    await tx.done;
    inodeCache.set("root", root);
    return root;
  },

  forProcess(
    context: ProcessContext,
    additionalGrants: () => readonly FileSystemGrant[] = () => [],
  ): ProcessFileSystem
  {
    // This scopes users of the facade; same-origin code still needs a real sandbox.
    const process = createProcessContext(context);
    return {
      readMetadata: async (path) =>
      {
        assertCapability(process, "read", path, additionalGrants());
        await assertReadPermissions(path);
        return await vfs.readMetadata(path);
      },
      readContent: async (path) =>
      {
        assertCapability(process, "read", path, additionalGrants());
        await assertReadPermissions(path);
        return await vfs.readContent(path);
      },
      listDirectory: async (path) =>
      {
        assertCapability(process, "list", path, additionalGrants());
        await assertReadPermissions(path);
        return await vfs.listDirectory(path);
      },
      writeFile: async (path, content, mimeType) =>
      {
        await assertWritePermissions(process, path, true, additionalGrants());
        return await vfs.writeFile(path, content, mimeType);
      },
      createDirectory: async (path) =>
      {
        const normalizedPath = normalizeDirectoryPath(path);
        await assertWritePermissions(process, normalizedPath, false, additionalGrants());
        return await vfs.createDirectory(normalizedPath);
      },
      delete: async (path) =>
      {
        await assertWritePermissions(process, path, false, additionalGrants());
        return await vfs.delete(path);
      },
      move: async (sourcePath, destinationPath) =>
      {
        const grants = additionalGrants();
        await assertWritePermissions(process, sourcePath, false, grants);
        await assertWritePermissions(process, destinationPath, false, grants);
        return await vfs.move(sourcePath, destinationPath);
      },
    };
  },

  async readMetadata(path: string)
  {
    const id = await resolvePathToId(path);
    return await loadMetadata(id);
  },

  async readContent(path: string)
  {
    const id = await resolvePathToId(path);
    return await loadContent(id);
  },

  async listDirectory(path: string): Promise<VFSNode[]>
  {
    const id = await resolvePathToId(path);
    const node = await loadMetadata(id);
    if (node.nodeType !== VFSNodeType.DIRECTORY)
    {
      throw new VFSError("ENOTDIR", `Not a directory: '${path}'`);
    }

    const children = await Promise.all(
      Object.values(node.children).map((childId) => loadMetadata(childId)),
    );
    return children.toSorted((a, b) => a.name.localeCompare(b.name));
  },

  async writeFile(
    path: string,
    content: VFSContent,
    mimeType = "text/plain",
    sourceVersion?: number,
  )
  {
    VFSContentSchema.parse(content);

    const { parentId, nodeName, existingId } = await prepareNodeContext(path);
    const contentSize = content.byteLength;
    let node: VFSNode;

    if (existingId)
    {
      const existingNode = await loadMetadata(existingId);
      if (existingNode.nodeType === VFSNodeType.DIRECTORY)
      {
        throw new VFSError("EEXIST", `Is a directory: '${nodeName}'`);
      }
      node = {
        ...existingNode,
        mimeType,
        size: contentSize,
        ...(sourceVersion === undefined ? {} : { sourceVersion }),
      };
    }
    else
    {
      node = {
        id: crypto.randomUUID(),
        parentId,
        name: nodeName,
        nodeType: VFSNodeType.FILE,
        mimeType,
        permissions: { read: true, write: true },
        size: contentSize,
        ...(sourceVersion === undefined ? {} : { sourceVersion }),
      };
    }

    // Optimistic UI updates
    inodeCache.set(node.id, node);
    contentCache.set(node.id, content);

    if (!existingId)
    {
      inodeCache.set(parentId, (parent) =>
      {
        if (!parent || parent.nodeType !== VFSNodeType.DIRECTORY)
        {
          return parent;
        }
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
    try
    {
      const updatedParent = inodeCache.get(parentId);

      const db = await dbSingleton;
      const tx = db.transaction(["inodes", "content"], "readwrite");
      tx.objectStore("inodes").put(node, node.id);
      tx.objectStore("content").put(content, node.id);

      if (!existingId)
      {
        if (updatedParent)
        {
          tx.objectStore("inodes").put(updatedParent, parentId);
        }
      }
      await tx.done;
      notifyChange(path);
      return node;
    }
    catch (e)
    {
      console.error(`Critical storage failure writing file '${nodeName}':`, e);
      await Promise.all([
        loadMetadata(node.id, { forceRefresh: true }).catch(),
        loadContent(node.id, { forceRefresh: true }).catch(),
        loadMetadata(parentId, { forceRefresh: true }).catch(),
      ]);
      throw e;
    }
  },

  async createDirectory(path: string): Promise<VFSNode>
  {
    const normalizedInput = path.endsWith("/") && path !== "/"
      ? path.slice(0, -1)
      : path;

    // Throws if parent path is broken
    const { parentId, nodeName, existingId } = await prepareNodeContext(
      normalizedInput,
    );

    if (existingId)
    {
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
    inodeCache.set(parentId, (parent) =>
    {
      if (!parent || parent.nodeType !== VFSNodeType.DIRECTORY)
      {
        return parent;
      }
      return {
        ...parent,
        children: {
          ...parent.children,
          [nodeName]: node.id,
        },
      };
    });

    // Storage Persistence
    try
    {
      const updatedParent = inodeCache.get(parentId);

      const db = await dbSingleton;
      const tx = db.transaction(["inodes"], "readwrite");
      tx.objectStore("inodes").put(node, node.id);

      if (updatedParent)
      {
        tx.objectStore("inodes").put(updatedParent, parentId);
      }

      await tx.done;
      notifyChange(normalizedInput);
      return node;
    }
    catch (e)
    {
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

  async setPermissions(
    path: string,
    permissions: VFSNode["permissions"],
  ): Promise<VFSNode>
  {
    const id = await resolvePathToId(path);
    const node = await loadMetadata(id);
    const updatedNode = { ...node, permissions };

    try
    {
      const db = await dbSingleton;
      const tx = db.transaction("inodes", "readwrite");
      tx.objectStore("inodes").put(updatedNode, id);
      await tx.done;
      inodeCache.set(id, updatedNode);
      notifyChange(path);
      return updatedNode;
    }
    catch (e)
    {
      await loadMetadata(id, { forceRefresh: true }).catch();
      throw e;
    }
  },

  async move(sourcePath: string, destinationPath: string): Promise<VFSNode>
  {
    const validatedSourcePath = CanonicalPathSchema.parse(sourcePath);
    const validatedDestinationPath = CanonicalPathSchema.parse(destinationPath);
    const sourceId = await resolvePathToId(validatedSourcePath);
    if (sourceId === "root")
    {
      throw new VFSError("EEXIST", "Cannot move the root directory.");
    }
    if (validatedSourcePath === validatedDestinationPath)
    {
      return await loadMetadata(sourceId);
    }

    const sourceNode = await loadMetadata(sourceId);
    if (!sourceNode.parentId)
    {
      throw new VFSError("EEXIST", `Cannot move '${validatedSourcePath}'.`);
    }

    const destinationParentPath = parentPathOf(validatedDestinationPath);
    if (
      sourceNode.nodeType === VFSNodeType.DIRECTORY
      && isWithinPath(destinationParentPath, validatedSourcePath)
    )
    {
      throw new VFSError("EEXIST", "Cannot move a directory inside itself.");
    }

    const { parentId: destinationParentId, parentNode: destinationParent, nodeName, existingId } =
      await prepareNodeContext(validatedDestinationPath);
    if (existingId)
    {
      throw new VFSError("EEXIST", `Destination already exists: '${validatedDestinationPath}'`);
    }

    const sourceParent = await loadMetadata(sourceNode.parentId);
    if (sourceParent.nodeType !== VFSNodeType.DIRECTORY)
    {
      throw new VFSError("ENOTDIR", `Not a directory: '${sourceParent.name}'`);
    }

    const { [sourceNode.name]: _, ...sourceChildren } = sourceParent.children;
    const movedNode: VFSNode = {
      ...sourceNode,
      parentId: destinationParentId,
      name: nodeName,
    };
    const updatedSourceParent: VFSNode = {
      ...sourceParent,
      children: sourceParent.id === destinationParentId
        ? { ...sourceChildren, [nodeName]: sourceNode.id }
        : sourceChildren,
    };
    const updatedDestinationParent: VFSNode = sourceParent.id === destinationParentId
      ? updatedSourceParent
      : {
        ...destinationParent,
        children: {
          ...destinationParent.children,
          [nodeName]: sourceNode.id,
        },
      };

    const db = await dbSingleton;
    const tx = db.transaction("inodes", "readwrite");
    tx.objectStore("inodes").put(movedNode, movedNode.id);
    tx.objectStore("inodes").put(updatedSourceParent, updatedSourceParent.id);
    if (sourceParent.id !== destinationParentId)
    {
      tx.objectStore("inodes").put(updatedDestinationParent, updatedDestinationParent.id);
    }
    await tx.done;

    inodeCache.set(movedNode.id, movedNode);
    inodeCache.set(updatedSourceParent.id, updatedSourceParent);
    if (sourceParent.id !== destinationParentId)
    {
      inodeCache.set(updatedDestinationParent.id, updatedDestinationParent);
    }
    notifyChange(validatedSourcePath);
    notifyChange(validatedDestinationPath);
    return movedNode;
  },

  async delete(path: string)
  {
    const id = await resolvePathToId(path);
    if (id === "root")
    {
      throw new VFSError("EEXIST", "Cannot delete the root directory.");
    }

    const node = await loadMetadata(id);
    if (
      node.nodeType === VFSNodeType.DIRECTORY
      && Object.keys(node.children).length > 0
    )
    {
      throw new VFSError("ENOTEMPTY", `Directory is not empty: '${path}'`);
    }

    inodeCache.delete(node.id);
    contentCache.delete(node.id);

    if (node.parentId)
    {
      inodeCache.set(
        node.parentId,
        (parentNode) =>
        {
          if (!parentNode || parentNode.nodeType !== VFSNodeType.DIRECTORY)
          {
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

    try
    {
      const db = await dbSingleton;
      const tx = db.transaction(["inodes", "content"], "readwrite");

      tx.objectStore("inodes").delete(node.id);
      tx.objectStore("content").delete(node.id);

      if (node.parentId)
      {
        const parentNode = inodeCache.get(node.parentId);
        if (!parentNode || parentNode.nodeType !== VFSNodeType.DIRECTORY)
        {
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
      notifyChange(path);
    }
    catch (e)
    {
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
      throw e;
    }
  },

  async preLoad(path: string)
  {
    const id = await resolvePathToId(path);
    if (id)
    {
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
  upgrade(db)
  {
    db.createObjectStore("inodes");
    db.createObjectStore("content");
  },
});

function notifyChange(path: string): void
{
  for (const listener of changeListeners)
  {
    try
    {
      listener(path);
    }
    catch (error)
    {
      console.error("VFS change listener failed:", error);
    }
  }
}

async function resolvePathToId(path: string): Promise<string>
{
  const parts = path.split("/").filter(Boolean);
  let currId = "root";

  if (path === "/" || path === "")
  {
    return "root";
  }

  for (const part of parts)
  {
    let currNode = inodeCache.get(currId);

    if (!currNode)
    {
      currNode = await loadMetadata(currId).catch(() =>
      {
        throw new VFSError(
          "ENOENT",
          `File system integrity error: missing descriptor '${currId}'`,
        );
      });
    }

    if (currNode.nodeType !== VFSNodeType.DIRECTORY)
    {
      throw new VFSError("ENOTDIR", `Not a directory: '${currNode.name}'`);
    }

    const nextId = currNode.children?.[part];
    if (!nextId)
    {
      throw new VFSError("ENOENT", `No such file or directory: '${part}'`);
    }

    currId = nextId;
  }

  return currId;
}

function assertCapability(
  context: ProcessContext,
  action: FileSystemAction,
  path: string,
  additionalGrants: readonly FileSystemGrant[] = [],
): string
{
  const validatedPath = CanonicalPathSchema.parse(path);
  const isGranted = [...context.fileSystemGrants, ...additionalGrants].some((grant) =>
    grant.actions.includes(action) && isWithinPath(validatedPath, grant.path)
  );

  if (!isGranted)
  {
    throw new VFSError(
      "EACCES",
      `Process ${context.pid} (${context.appId}) lacks ${action} access to '${validatedPath}'.`,
    );
  }

  return validatedPath;
}

function isWithinPath(path: string, grantPath: string): boolean
{
  return grantPath === "/" || path === grantPath
    || path.startsWith(`${grantPath}/`);
}

async function assertReadPermissions(path: string): Promise<void>
{
  const nodes = await resolvePathNodes(path);
  for (const node of nodes)
  {
    if (!node.permissions.read)
    {
      throw new VFSError("EACCES", `Read access denied: '${path}'`);
    }
  }
}

async function assertWritePermissions(
  context: ProcessContext,
  path: string,
  checkExistingFile: boolean,
  additionalGrants: readonly FileSystemGrant[] = [],
): Promise<void>
{
  const validatedPath = assertCapability(context, "write", path, additionalGrants);
  const { parentNode, existingId } = await prepareNodeContext(validatedPath);
  const parentPath = parentPathOf(validatedPath);

  await assertReadPermissions(parentPath);
  if (!parentNode.permissions.write)
  {
    throw new VFSError("EACCES", `Write access denied: '${parentPath}'`);
  }

  if (checkExistingFile && existingId)
  {
    const existingNode = await loadMetadata(existingId);
    if (
      existingNode.nodeType === VFSNodeType.FILE
      && !existingNode.permissions.write
    )
    {
      throw new VFSError("EACCES", `Write access denied: '${validatedPath}'`);
    }
  }
}

async function resolvePathNodes(path: string): Promise<VFSNode[]>
{
  const validatedPath = CanonicalPathSchema.parse(path);
  const parts = validatedPath.split("/").filter(Boolean);
  const nodes: VFSNode[] = [await loadMetadata("root")];

  for (const part of parts)
  {
    const parent = nodes[nodes.length - 1];
    if (parent.nodeType !== VFSNodeType.DIRECTORY)
    {
      throw new VFSError("ENOTDIR", `Not a directory: '${parent.name}'`);
    }

    const childId = parent.children[part];
    if (!childId)
    {
      throw new VFSError("ENOENT", `No such file or directory: '${part}'`);
    }
    nodes.push(await loadMetadata(childId));
  }

  return nodes;
}

function normalizeDirectoryPath(path: string): string
{
  return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
}

function parentPathOf(path: string): string
{
  const lastSlashIndex = path.lastIndexOf("/");
  return lastSlashIndex === 0 ? "/" : path.slice(0, lastSlashIndex);
}

async function loadMetadata(id: string, options?: { forceRefresh: boolean })
{
  if (inodeCache.has(id) && !options?.forceRefresh)
  {
    return inodeCache.get(id)!;
  }

  const db = await dbSingleton;
  const node = await db.get("inodes", id);
  if (!node)
  {
    throw new Error("File not found");
  }

  const validNode = VFSNodeSchema.safeParse(node);

  if (!validNode.success)
  {
    console.error(
      `Failed to parse node stored at ${id}:`,
      z.treeifyError(validNode.error),
    );
    throw new Error("File system corruption detected.");
  }

  inodeCache.set(id, validNode.data);
  return validNode.data;
}

async function loadContent(id: string, options?: { forceRefresh: boolean })
{
  if (contentCache.has(id) && !options?.forceRefresh)
  {
    return contentCache.get(id)!;
  }

  const db = await dbSingleton;
  const content = await db.get("content", id);

  const validContent = VFSContentSchema.safeParse(content);

  if (!validContent.success)
  {
    console.error(
      `Failed to parse content stored at ${id}:`,
      z.treeifyError(validContent.error),
    );
    throw new Error("File system corruption detected.");
  }

  contentCache.set(id, validContent.data);
  return validContent.data;
}

async function prepareNodeContext(path: string)
{
  const validatedPath = CanonicalPathSchema.parse(path);

  if (validatedPath === "/")
  {
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
  if (parentNode.nodeType !== VFSNodeType.DIRECTORY)
  {
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
