import { beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";

// Global browser-agnostic IndexedDB mocking
import "fake-indexeddb/auto";

import { vfs } from "./vfs.ts";
import { VFSError, VFSNodeType } from "./structure.ts";

describe("Virtual File System (VFS) Contract Invariants", () => {
  beforeEach(async () => {
    // Isolated transactional database wipe before every run
    const { openDB } = await import("idb");
    const db = await openDB("VFS", 1);
    const tx = db.transaction(["inodes", "content"], "readwrite");
    await tx.objectStore("inodes").clear();
    await tx.objectStore("content").clear();

    // Bootstrap fundamental POSIX / root anchor
    await tx.objectStore("inodes").put({
      id: "root",
      name: "root",
      nodeType: VFSNodeType.DIRECTORY,
      permissions: { read: true, write: true },
      size: 0,
      children: {},
    }, "root");
    await tx.done;
  });

  describe("1. Path Traversal & Structural Integrity", () => {
    it("should allow multi-level nested directory paths to be resolved sequentially", async () => {
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

    it("should reject intermediate traversal if a segment along the path is a FILE, not a DIRECTORY (ENOTDIR)", async () => {
      const payload = new Uint8Array([1, 2, 3]);
      await vfs.writeFile("/blocking-file.dat", payload);

      // Attempting to treat a binary blob file as a path directory must fail via standard POSIX definition
      const operation = vfs.createDirectory("/blocking-file.dat/subfolder");

      await expect(operation).rejects.toThrow(VFSError);
      await expect(operation).rejects.toThrow(/not a directory|enotdir/i);
    });
  });

  describe("2. Data & Metadata Consistency State Lifecycle", () => {
    it("should guarantee byte-for-byte read/write idempotency and match metadata sizes", async () => {
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

    it("should cleanly overwrite historical payload files and accurately update metadata allocations", async () => {
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

  describe("3. Edge Failures & Collisions", () => {
    it("should reject reading or checking metadata for entries that do not exist (ENOENT)", async () => {
      const metaCheck = vfs.readMetadata("/var/log/syslog.log");
      const contentCheck = vfs.readContent("/missing.txt");

      await expect(metaCheck).rejects.toThrow(VFSError);
      await expect(contentCheck).rejects.toThrow(VFSError);
    });

    it("should prevent duplicate naming collisions when a resource path target is occupied (EEXIST)", async () => {
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

  describe("4. Non-Functional Performance Contracts", () => {
    it("should process 1,000 file write/read lifecycles under a strict 500ms SLA boundary", async () => {
      await vfs.createDirectory("/perf-test");

      const fileCount = 1000;
      const dummyPayload = new TextEncoder().encode(
        "kernel_chunk_data_payload",
      );

      // Start precision baseline timer
      const startTime = performance.now();

      // Execute 1,000 distinct, sequential file transactions
      for (let i = 0; i < fileCount; i++) {
        const filePath = `/perf-test/file_${i}.tmp`;

        // Write transaction block
        await vfs.writeFile(filePath, dummyPayload);

        // Read verification block
        const readBack = await vfs.readContent(filePath);

        // Sanity integrity assertion inside the loop
        if (readBack.byteLength !== dummyPayload.byteLength) {
          throw new Error(
            `Data corruption detected at iteration sequence ${i}`,
          );
        }
      }

      const totalDuration = performance.now() - startTime;
      console.log(
        `\n⏱️  VFS Performance: 1,000 files read/written in ${
          totalDuration.toFixed(2)
        }ms`,
      );

      // Fallibility threshold boundary contract checking
      const maxAllowedMs = 500;
      expect(totalDuration).toBeLessThan(maxAllowedMs);
    });
  });
});
