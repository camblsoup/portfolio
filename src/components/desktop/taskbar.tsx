import { createSignal, For, onCleanup, Show } from "solid-js";
import { useKernel } from "../kernel-provider.tsx";
import { useWindowManager } from "./window-manager-context.tsx";

export function Taskbar()
{
  const windowManager = useWindowManager();
  const kernel = useKernel();
  const [time, setTime] = createSignal(new Date());

  const timer = setInterval(() =>
  {
    setTime(new Date());
  }, 1000);

  onCleanup(() => clearInterval(timer));

  return (
    <footer class="taskbar" aria-label="Open windows">
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
                onClick={() => windowManager.focus(windowId)}
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
