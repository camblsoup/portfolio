import * as z from "zod";
import { CanonicalPathSchema } from "./vfs/structure.ts";

export const FileSystemActionSchema = z.enum(["read", "write", "list"]);
export type FileSystemAction = z.infer<typeof FileSystemActionSchema>;

export const FileSystemGrantSchema = z.object({
  path: CanonicalPathSchema,
  actions: z.array(FileSystemActionSchema).min(1),
});
export interface FileSystemGrant
{
  readonly path: string;
  readonly actions: readonly FileSystemAction[];
}

const ProcessContextSchema = z.object({
  pid: z.number().int().positive(),
  appId: z.string().min(1),
  fileSystemGrants: z.array(FileSystemGrantSchema),
});

export interface ProcessContext
{
  readonly pid: number;
  readonly appId: string;
  readonly fileSystemGrants: readonly FileSystemGrant[];
}

export type ProcessContextInput = ProcessContext;

export function createProcessContext(
  input: ProcessContextInput,
): ProcessContext
{
  const context = ProcessContextSchema.parse(input);

  const grants = context.fileSystemGrants.map((grant): FileSystemGrant =>
    Object.freeze({
      ...grant,
      actions: Object.freeze([...new Set(grant.actions)]),
    })
  );

  return Object.freeze({
    ...context,
    fileSystemGrants: Object.freeze(grants),
  });
}
