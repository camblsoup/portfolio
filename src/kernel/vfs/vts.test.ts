import { beforeEach, describe, expect, it } from "vitest";

// Global browser-agnostic IndexedDB mocking
import "fake-indexeddb/auto";

import { createProcessContext } from "../process-context.ts";
import { contentCache, inodeCache } from "./cache.ts";
import { VFSError, VFSNodeType } from "./structure.ts";
import { vfs } from "./vfs.ts";

describe("Virtual File System (VFS) Contract Invariants", () =>
{
  beforeEach(async () =>
  {
    const { openDB } = await import("idb");
    const db = await openDB("VFS", 1);
    const tx = db.transaction(["inodes", "content"], "readwrite");
    await tx.objectStore("inodes").clear();
    await tx.objectStore("content").clear();
    await tx.done;

    inodeCache.clear();
    contentCache.clear();
    await vfs.ensureRoot();
  });

  describe("0. Kernel Initialization & Scoped Access", () =>
  {
    it("creates the root on first startup and preserves it on later startup", async () =>
    {
      const { openDB } = await import("idb");
      const db = await openDB("VFS", 1);
      const tx = db.transaction(["inodes", "content"], "readwrite");
      await tx.objectStore("inodes").clear();
      await tx.objectStore("content").clear();
      await tx.done;
      inodeCache.clear();
      contentCache.clear();

      const firstRoot = await vfs.ensureRoot();
      const child = await vfs.createDirectory("/preserved");
      const nextRoot = await vfs.ensureRoot();

      expect(firstRoot.id).toBe("root");
      expect(nextRoot.children.preserved).toBe(child.id);
    });

    it("restricts process access to granted paths and actions", async () =>
    {
      const fs = vfs.forProcess(createProcessContext({
        pid: 7,
        appId: "notes.app",
        fileSystemGrants: [{
          path: "/apps/notes",
          actions: ["read", "write", "list"],
        }],
      }));

      await vfs.createDirectory("/apps");
      await vfs.createDirectory("/apps/notes");
      await fs.createDirectory("/apps/notes/data");
      await fs.writeFile(
        "/apps/notes/data/note.txt",
        new TextEncoder().encode("private note"),
      );

      expect(await fs.readContent("/apps/notes/data/note.txt")).toEqual(
        new TextEncoder().encode("private note"),
      );
      expect((await fs.listDirectory("/apps/notes/data")).map((node) => node.name))
        .toEqual(["note.txt"]);
      await fs.createDirectory("/apps/notes/archive");
      await fs.move("/apps/notes/data/note.txt", "/apps/notes/archive/note.txt");
      await expect(fs.readContent("/apps/notes/archive/note.txt")).resolves.toEqual(
        new TextEncoder().encode("private note"),
      );
      await expect(fs.move(
        "/apps/notes/archive/note.txt",
        "/private/note.txt",
      )).rejects.toMatchObject({ code: "EACCES" });

      await expect(fs.readContent("/apps/notes-backup/note.txt"))
        .rejects.toMatchObject({ code: "EACCES" });
      await expect(fs.writeFile(
        "/private/secret.txt",
        new Uint8Array([1]),
      )).rejects.toMatchObject({ code: "EACCES" });
    });

    it("enforces node read/write flags and keeps listing as a separate capability", async () =>
    {
      await vfs.createDirectory("/apps");
      await vfs.createDirectory("/apps/notes");
      await vfs.writeFile(
        "/apps/notes/locked.txt",
        new Uint8Array([1]),
      );
      await vfs.setPermissions("/apps/notes/locked.txt", {
        read: false,
        write: false,
      });

      const readWriteOnly = vfs.forProcess(createProcessContext({
        pid: 8,
        appId: "notes.app",
        fileSystemGrants: [{
          path: "/apps/notes",
          actions: ["read", "write"],
        }],
      }));
      await expect(readWriteOnly.listDirectory("/apps/notes"))
        .rejects.toMatchObject({ code: "EACCES" });
      await expect(readWriteOnly.readContent("/apps/notes/locked.txt"))
        .rejects.toMatchObject({ code: "EACCES" });
      await expect(readWriteOnly.writeFile(
        "/apps/notes/locked.txt",
        new Uint8Array([2]),
      )).rejects.toMatchObject({ code: "EACCES" });
    });
  });

  describe("0.1. Change Notifications", () =>
  {
    it("notifies subscribers after persisted file and directory changes", async () =>
    {
      const changedPaths: string[] = [];
      const unsubscribe = vfs.subscribe((path) => changedPaths.push(path));

      await vfs.writeFile("/changed.txt", new Uint8Array([1]));
      await vfs.createDirectory("/new-folder");
      unsubscribe();
      await vfs.writeFile("/after-unsubscribe.txt", new Uint8Array([2]));

      expect(changedPaths).toEqual(["/changed.txt", "/new-folder"]);
    });
  });

  describe("1. Path Traversal & Structural Integrity", () =>
  {
    it("should allow multi-level nested directory paths to be resolved sequentially", async () =>
    {
      // Setup structural tree
      await vfs.createDirectory("/usr");
      await vfs.createDirectory("/usr/bin");

      const leaf = await vfs.createDirectory("/usr/bin/config");
      expect(leaf.name).toBe("config");
      expect(leaf.nodeType).toBe(VFSNodeType.DIRECTORY);

      // Verify path mapping is objectively reachable
      const metadata = await vfs.readMetadata("/usr/bin/config");
      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe(leaf.id);
    });

    it("should reject intermediate traversal if a segment along the path is a FILE, not a DIRECTORY (ENOTDIR)", async () =>
    {
      const payload = new Uint8Array([1, 2, 3]);
      await vfs.writeFile("/blocking-file.dat", payload);

      const operation = vfs.createDirectory("/blocking-file.dat/subfolder");

      await expect(operation).rejects.toThrow(VFSError);
      await expect(operation).rejects.toThrow(/not a directory|enotdir/i);
    });

    it("should move files without changing their contents and prevent directory cycles", async () =>
    {
      await vfs.createDirectory("/source");
      await vfs.createDirectory("/destination");
      await vfs.createDirectory("/source/nested");
      const content = new TextEncoder().encode("move me");
      await vfs.writeFile("/source/note.txt", content);

      const moved = await vfs.move("/source/note.txt", "/destination/renamed.txt");
      expect(moved.name).toBe("renamed.txt");
      await expect(vfs.readMetadata("/source/note.txt"))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expect(vfs.readContent("/destination/renamed.txt")).resolves.toEqual(content);
      await expect(vfs.move("/source", "/source/nested/source"))
        .rejects.toMatchObject({ code: "EEXIST" });
    });

    it("should protect the root and reject deletion of non-empty directories", async () =>
    {
      await vfs.createDirectory("/non-empty");
      await vfs.createDirectory("/non-empty/child");

      await expect(vfs.delete("/")).rejects.toMatchObject({ code: "EEXIST" });
      await expect(vfs.delete("/non-empty"))
        .rejects.toMatchObject({ code: "ENOTEMPTY" });
      await expect(vfs.readMetadata("/non-empty/child")).resolves.toBeDefined();
    });
  });

  describe("2. Data & Metadata Consistency State Lifecycle", () =>
  {
    it("should guarantee byte-for-byte read/write idempotency and match metadata sizes", async () =>
    {
      const sampleText = "The quick brown fox jumps over the lazy dog";
      const binaryPayload = new TextEncoder().encode(sampleText);
      const expectedSize = binaryPayload.byteLength;

      // 1. Explicitly build the parent directory pathway structure first
      await vfs.createDirectory("/documents");

      // 2. Assert creation and initial metadata state
      const node = await vfs.writeFile("/documents/story.txt", binaryPayload);
      expect(node.size).toBe(expectedSize);
      expect(node.nodeType).toBe(VFSNodeType.FILE);

      // 3. Assert lookup consistency
      const content = await vfs.readContent("/documents/story.txt");
      expect(content).toEqual(binaryPayload);

      // Secondary check: reading metadata explicitly matches the content payload dimension
      const refreshedMeta = await vfs.readMetadata("/documents/story.txt");
      expect(refreshedMeta?.size).toBe(expectedSize);
    });

    it("should cleanly overwrite historical payload files and accurately update metadata allocations", async () =>
    {
      const initialPayload = new Uint8Array([0, 0, 0, 0]); // 4 bytes
      const updatedPayload = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]); // 10 bytes

      await vfs.writeFile("/state.bin", initialPayload);

      const initialRead = await vfs.readContent("/state.bin");
      expect(initialRead).toEqual(initialPayload);

      // Perform destructive overwrite update mutation
      const updatedNode = await vfs.writeFile("/state.bin", updatedPayload);
      expect(updatedNode.size).toBe(10);

      const updatedRead = await vfs.readContent("/state.bin");
      expect(updatedRead).toEqual(updatedPayload);
    });
  });

  describe("3. Edge Failures & Collisions", () =>
  {
    it("should reject reading or checking metadata for entries that do not exist (ENOENT)", async () =>
    {
      const metaCheck = vfs.readMetadata("/var/log/syslog.log");
      const contentCheck = vfs.readContent("/missing.txt");

      await expect(metaCheck).rejects.toThrow(VFSError);
      await expect(contentCheck).rejects.toThrow(VFSError);
    });

    it("should prevent duplicate naming collisions when a resource path target is occupied (EEXIST)", async () =>
    {
      await vfs.createDirectory("/shared");

      // Attempting to allocate an identical file or folder over an active path asset should be prohibited
      const collisionDirOperation = vfs.createDirectory("/shared");
      const collisionFileOperation = vfs.writeFile(
        "/shared",
        new Uint8Array([]),
      );

      await expect(collisionDirOperation).rejects.toThrow(VFSError);
      await expect(collisionFileOperation).rejects.toThrow(VFSError);
    });
  });

  describe("4. Non-Functional Performance Contracts", () =>
  {
    it("should process 1,000 file write/read lifecycles within a generous upper bound", async () =>
    {
      await vfs.createDirectory("/perf-test");

      const fileCount = 1000;
      const dummyPayload = new TextEncoder().encode(
        "kernel_chunk_data_payload",
      );

      // Start precision baseline timer
      const startTime = performance.now();

      // Execute 1,000 distinct, sequential file transactions
      for (let i = 0; i < fileCount; i++)
      {
        const filePath = `/perf-test/file_${i}.tmp`;

        // Write transaction block
        await vfs.writeFile(filePath, dummyPayload);

        // Read verification block
        const readBack = await vfs.readContent(filePath);

        // Sanity integrity assertion inside the loop
        if (readBack.byteLength !== dummyPayload.byteLength)
        {
          throw new Error(
            `Data corruption detected at iteration sequence ${i}`,
          );
        }
      }

      const totalDuration = performance.now() - startTime;
      console.log(
        `\n⏱️  VFS Performance: 1,000 files read/written in ${totalDuration.toFixed(2)}ms`,
      );

      // This is a fake-indexeddb regression guard, not a browser performance SLA.
      const maxAllowedMs = 2_000;
      expect(totalDuration).toBeLessThan(maxAllowedMs);
    });
  });
});
