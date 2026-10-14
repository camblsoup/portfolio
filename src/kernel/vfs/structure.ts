import * as z from "zod";

/** Identifies whether a VFS node is a directory or file. */
export enum VFSNodeType {
  DIRECTORY,
  FILE,
}

/** Zod schema for common VFS node metadata. */
export const baseVFSNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  name: z.string(),

  nodeType: z.enum(VFSNodeType),
  permissions: z.object({
    read: z.boolean(),
    write: z.boolean(),
  }),
  size: z.number(),
});

/** Zod schema for directory metadata and child links. */
export const VFSDirectoryNodeSchema = baseVFSNodeSchema.extend({
  nodeType: z.literal(VFSNodeType.DIRECTORY),
  children: z.record(z.string(), z.string()),
});

/** Zod schema for file metadata. */
export const VFSFileNodeSchema = baseVFSNodeSchema.extend({
  nodeType: z.literal(VFSNodeType.FILE),
  mimeType: z.string(),
});

/** Zod schema for either supported VFS node type. */
export const VFSNodeSchema = z.discriminatedUnion("nodeType", [
  VFSDirectoryNodeSchema,
  VFSFileNodeSchema,
]);

/** Zod schema for binary file content. */
export const VFSContentSchema = z.instanceof(Uint8Array, {
  error: "Input must be a valid Uint8Array",
});

export type BaseVFSNode = z.infer<typeof baseVFSNodeSchema>;
export type VFSDirectoryNode = z.infer<typeof VFSDirectoryNodeSchema>;
export type VFSFileNode = z.infer<typeof VFSFileNodeSchema>;
export type VFSContent = z.infer<typeof VFSContentSchema>;
export type VFSNode = z.infer<typeof VFSNodeSchema>;

/** Error raised for a VFS path or node operation failure. */
export class VFSError extends Error {
  constructor(
    public code: "ENOENT" | "ENOTDIR" | "EEXIST",
    message: string,
  ) {
    super(message);
    this.name = "VFSError";

    // Insulates stack trace for cleaner debugging in Deno/Browser
    if (this.stack) {
      const lines = this.stack.split("\n");
      // Remove the internal constructor call line from the stack trace
      if (lines[1] && lines[1].includes("VFSError")) {
        lines.splice(1, 1);
        this.stack = lines.join("\n");
      }
    }
  }
}

/** Validates a single directory or file name. */
export const NodeNameSchema = z.string()
  .min(1, "Target name cannot be empty.")
  .max(255, "Target name exceeds maximum length of 255 characters.")
  .refine(
    (name) => name !== "." && name !== "..",
    "Reserved names '.' and '..' are prohibited.",
  );

/** Validates an absolute canonical VFS path. */
export const CanonicalPathSchema = z.string()
  .startsWith("/", "Paths must be absolute and begin with '/'.")
  .refine(
    (p) => p === "/" || !p.endsWith("/"),
    "Trailing slashes are prohibited on file paths.",
  )
  .refine(
    (p) => !p.includes("//"),
    "Empty directory segments ('//') detected.",
  );
