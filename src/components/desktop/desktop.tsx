import type { Setter } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
import { DesktopIcons } from "./desktop-icons.tsx";
import { Taskbar } from "./taskbar.tsx";
import { WindowArea } from "./window-area.tsx";
import { WindowManagerProvider } from "./window-manager-context.tsx";

interface DesktopProps
{
  onOpenPath: (path: string) => void;
}

function clearSelectionOnOutsideClick(setSelectedItemId: Setter<string | undefined>)
{
  const onClick = (event: MouseEvent) =>
  {
    if (!(event.target instanceof Element) || !event.target.closest(".desktop-item"))
    {
      setSelectedItemId(undefined);
    }
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

export function Desktop(props: DesktopProps)
{
  const [selectedItemId, setSelectedItemId] = createSignal<string>();

  onMount(() =>
  {
    const unsubscribe = clearSelectionOnOutsideClick(setSelectedItemId);
    onCleanup(unsubscribe);
  });

  return (
    <WindowManagerProvider>
      <main class="desktop">
        <DesktopIcons
          onOpenPath={props.onOpenPath}
          selectedId={selectedItemId()}
          onSelect={setSelectedItemId}
        />
        <WindowArea />
        <Taskbar />
      </main>
    </WindowManagerProvider>
  );
}
