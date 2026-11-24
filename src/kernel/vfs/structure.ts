import * as z from "zod";

export enum VFSNodeType
{
  DIRECTORY,
  FILE,
}

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

export const VFSDirectoryNodeSchema = baseVFSNodeSchema.extend({
  nodeType: z.literal(VFSNodeType.DIRECTORY),
  children: z.record(z.string(), z.string()),
});

export const VFSFileNodeSchema = baseVFSNodeSchema.extend({
  nodeType: z.literal(VFSNodeType.FILE),
  mimeType: z.string(),
  sourceVersion: z.number().int().nonnegative().optional(),
});

export const VFSNodeSchema = z.discriminatedUnion("nodeType", [
  VFSDirectoryNodeSchema,
  VFSFileNodeSchema,
]);

export const VFSContentSchema = z.instanceof(Uint8Array, {
  error: "Input must be a valid Uint8Array",
});

export type BaseVFSNode = z.infer<typeof baseVFSNodeSchema>;
export type VFSDirectoryNode = z.infer<typeof VFSDirectoryNodeSchema>;
export type VFSFileNode = z.infer<typeof VFSFileNodeSchema>;
export type VFSContent = z.infer<typeof VFSContentSchema>;
export type VFSNode = z.infer<typeof VFSNodeSchema>;

export class VFSError extends Error
{
  constructor(
    public code:
      | "ENOENT"
      | "ENOTDIR"
      | "EEXIST"
      | "EACCES"
      | "ENOTEMPTY",
    message: string,
  )
  {
    super(message);
    this.name = "VFSError";

    // Insulates stack trace for cleaner debugging in browser environments
    if (this.stack)
    {
      const lines = this.stack.split("\n");
      // Remove the internal constructor call line from the stack trace
      if (lines[1] && lines[1].includes("VFSError"))
      {
        lines.splice(1, 1);
        this.stack = lines.join("\n");
      }
    }
  }
}

export const NodeNameSchema = z.string()
  .min(1, "Target name cannot be empty.")
  .max(255, "Target name exceeds maximum length of 255 characters.")
  .refine(
    (name) => name !== "." && name !== "..",
    "Reserved names '.' and '..' are prohibited.",
  );

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
