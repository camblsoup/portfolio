import { BaseVFSNode } from "../kernel/vfs/structure";

export function extensionSort(a: BaseVFSNode, b: BaseVFSNode): number
{
  const ext1 = a.name.split(".").pop();
  const ext2 = b.name.split(".").pop();

  if (!ext1)
  {
    return 1;
  }

  if (!ext2)
  {
    return -1;
  }

  return ext1.localeCompare(ext2) || a.name.localeCompare(b.name);
}
