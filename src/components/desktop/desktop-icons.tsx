import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { appRegistry } from "../../kernel/app-registry/app-registry.ts";
import { defaultNodeIcon } from "../default-node-icon.ts";
import { DESKTOP_DIRECTORY } from "../../kernel/kernel.ts";
import type { VFSNode } from "../../kernel/vfs/structure.ts";
import { VFSNodeType } from "../../kernel/vfs/structure.ts";
import { useKernel } from "../kernel-provider.tsx";

interface DesktopIconsProps
{
  onOpenPath: (path: string) => void;
  selectedId: string | undefined;
  onSelect: (itemId: string) => void;
}

function iconFor(item: VFSNode): string
{
  const itemPath = `${DESKTOP_DIRECTORY}/${item.name}`;
  for (const manifest of appRegistry.values())
  {
    if (manifest.desktopPath === itemPath && manifest.icon)
    {
      return manifest.icon;
    }

    if (item.nodeType !== VFSNodeType.DIRECTORY)
    {
      const association = manifest.fileAssociations?.find(
        (candidate) => candidate.mimeType === item.mimeType && candidate.icon,
      );
      if (association?.icon)
      {
        return association.icon;
      }
    }
  }

  return defaultNodeIcon(item);
}

function affectsDesktopDirectory(changedPath: string): boolean
{
  return changedPath === DESKTOP_DIRECTORY
    || changedPath.startsWith(`${DESKTOP_DIRECTORY}/`)
    || DESKTOP_DIRECTORY.startsWith(`${changedPath}/`);
}

export function DesktopIcons(props: DesktopIconsProps)
{
  const kernel = useKernel();
  const [items, setItems] = createSignal<VFSNode[]>([]);
  const [error, setError] = createSignal("");

  createEffect(() =>
  {
    let cancelled = false;
    let refreshVersion = 0;

    const refresh = () =>
    {
      const version = ++refreshVersion;
      setError("");
      void kernel.listDirectory(DESKTOP_DIRECTORY).then((nodes) =>
      {
        if (!cancelled && version === refreshVersion)
        {
          setItems([...nodes]);
        }
      }).catch((reason: unknown) =>
      {
        if (!cancelled && version === refreshVersion)
        {
          setError(reason instanceof Error ? reason.message : "Unable to read desktop directory");
        }
      });
    };
    const unsubscribe = kernel.subscribeFileSystemChanges((changedPath) =>
    {
      if (affectsDesktopDirectory(changedPath)) refresh();
    });

    refresh();
    onCleanup(() =>
    {
      cancelled = true;
      unsubscribe();
    });
  });

  const openItem = (item: VFSNode) =>
  {
    props.onOpenPath(`${DESKTOP_DIRECTORY}/${item.name}`);
  };

  return (
    <section class="desktop-icons" aria-label="Desktop files">
      <For each={items()}>
        {(item) =>
        {
          const icon = iconFor(item);
          return (
            <button
              classList={{
                "desktop-item": true,
                selected: item.id === props.selectedId,
              }}
              type="button"
              onClick={() => props.onSelect(item.id)}
              onDblClick={() => openItem(item)}
            >
              <span class="desktop-item-icon">
                <img src={icon} alt="" />
              </span>
              <span class="desktop-item-name">{item.name}</span>
            </button>
          );
        }}
      </For>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </section>
  );
}
