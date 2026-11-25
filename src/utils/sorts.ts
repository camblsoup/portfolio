import { BaseVFSNode } from "../kernel/vfs/structure";

function extensionOf(name: string): string | undefined
{
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 && lastDot < name.length - 1 ? name.slice(lastDot + 1) : undefined;
}

export function extensionSort(a: BaseVFSNode, b: BaseVFSNode): number
{
  const ext1 = extensionOf(a.name);
  const ext2 = extensionOf(b.name);

  if (ext1 === undefined && ext2 !== undefined)
  {
    return -1;
  }

  if (ext1 !== undefined && ext2 === undefined)
  {
    return 1;
  }

  return (ext1?.localeCompare(ext2 ?? "") ?? 0) || a.name.localeCompare(b.name);
}
