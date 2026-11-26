import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { appArr } from "../../kernel/app-registry/app-registry.ts";
import { useKernel } from "../kernel-provider.tsx";
import { useWindowManager } from "./window-manager-context.tsx";

export function Taskbar()
{
  const windowManager = useWindowManager();
  const kernel = useKernel();
  const [time, setTime] = createSignal(new Date());
  const [launcherOpen, setLauncherOpen] = createSignal(false);
  let launcherButton: HTMLButtonElement | undefined;
  const launchableApps = appArr.filter((manifest) => manifest.component || manifest.link);

  onMount(() =>
  {
    const handleDocumentClick = (event: MouseEvent) =>
    {
      if (!(event.target instanceof Element) || !event.target.closest(".taskbar-launcher"))
      {
        setLauncherOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.key === "Escape" && launcherOpen())
      {
        setLauncherOpen(false);
        launcherButton?.focus();
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() =>
    {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const timer = setInterval(() =>
  {
    setTime(new Date());
  }, 1000);

  onCleanup(() => clearInterval(timer));

  return (
    <footer class="taskbar" aria-label="Taskbar">
      <div class="taskbar-launcher">
        <button
          ref={launcherButton}
          class="taskbar-launcher-button"
          type="button"
          aria-haspopup="menu"
          aria-expanded={launcherOpen()}
          aria-controls="taskbar-launcher-menu"
          onClick={() => setLauncherOpen((open) => !open)}
        >
          Apps
        </button>
        <Show when={launcherOpen()}>
          <div
            id="taskbar-launcher-menu"
            class="taskbar-launcher-menu"
            role="menu"
            aria-label="Applications"
          >
            <For each={launchableApps}>
              {(manifest) => (
                <button
                  class="taskbar-launcher-item"
                  type="button"
                  role="menuitem"
                  onClick={() =>
                  {
                    setLauncherOpen(false);
                    kernel.launchApp(manifest.id);
                  }}
                >
                  <img src={manifest.icon} alt="" />
                  <span>{manifest.name}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div class="taskbar-windows">
        <For
          each={windowManager.state.windows
            .toSorted((a, b) =>
              a.title.localeCompare(b.title, kernel.getSystemLocale()) || a.id - b.id
            )
            .map((window) => window.id)}
        >
          {(windowId) =>
          {
            const currentWindow = () =>
              windowManager.state.windows.find((window) => window.id === windowId)!;
            return (
              <button
                classList={{
                  "taskbar-window": true,
                  active: windowId === windowManager.state.focusedWindowId,
                }}
                type="button"
                onClick={() =>
                  currentWindow().state === "minimized"
                    || windowManager.state.focusedWindowId !== windowId
                    ? windowManager.focus(windowId)
                    : windowManager.minimize(windowId)}
              >
                {currentWindow().title}
                <Show when={currentWindow().state === "minimized"}> · minimized</Show>
              </button>
            );
          }}
        </For>
      </div>
      <span class="taskbar-tray">
        {Intl.DateTimeFormat(kernel.getSystemLocale(), {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: kernel.getLocalTimeZone(),
        }).format(time())}
      </span>
    </footer>
  );
}
