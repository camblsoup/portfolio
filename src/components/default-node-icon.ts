import type { VFSNode } from "../kernel/vfs/structure.ts";
import { VFSNodeType } from "../kernel/vfs/structure.ts";

export function defaultNodeIcon(node: VFSNode): string
{
  return node.nodeType === VFSNodeType.DIRECTORY
    ? "/file-icons/folder.svg"
    : "/file-icons/file.svg";
}
