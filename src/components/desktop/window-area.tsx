import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
import { WindowDecorator } from "./window-decorator.tsx";
import { useWindowManager } from "./window-manager-context.tsx";

export function WindowArea()
{
  const windowManager = useWindowManager();

  return (
    <section class="workspace" aria-label="Desktop workspace">
      <For
        each={windowManager.state.windows
          .filter((window) => window.state !== "minimized")
          .map((window) => window.id)}
      >
        {(windowId) =>
        {
          const currentWindow = () =>
            windowManager.state.windows.find((window) => window.id === windowId)!;
          const process = () => windowManager.kernel.processManager.get(currentWindow().pid)!;

          return (
            <WindowDecorator windowId={windowId}>
              <Dynamic
                component={process().manifest.component}
                bridge={process().bridge}
              />
            </WindowDecorator>
          );
        }}
      </For>
    </section>
  );
}
