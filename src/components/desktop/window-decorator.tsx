import * as DropdownMenu from "@kobalte/core/dropdown-menu";
import type { JSX } from "solid-js";
import { children, createSignal, For, onCleanup, Show } from "solid-js";
import { useWindowManager } from "./window-manager-context.tsx";

interface WindowDecoratorProps
{
  windowId: number;
  children: JSX.Element;
}

export function WindowDecorator(props: WindowDecoratorProps)
{
  const windowManager = useWindowManager();
  const resolvedChildren = children(() => props.children);
  const [contextMenuPosition, setContextMenuPosition] = createSignal<
    { x: number; y: number } | undefined
  >();
  let stopWindowInteraction: (() => void) | undefined;

  const currentWindow = () =>
    windowManager.state.windows.find((window) => window.id === props.windowId)!;
  const menus = () => windowManager.state.menusByPid[currentWindow().pid] ?? [];
  const contextMenuItems = () => windowManager.state.contextMenusByPid[currentWindow().pid] ?? [];

  const openContextMenu = (event: MouseEvent) =>
  {
    const items = contextMenuItems();
    if (items.length === 0)
    {
      return;
    }

    event.preventDefault();
    const container = event.currentTarget as HTMLElement;
    const bounds = container.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = items.length * 30;
    setContextMenuPosition({
      x: Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - menuWidth)),
      y: Math.max(0, Math.min(event.clientY - bounds.top, bounds.height - menuHeight)),
    });
  };

  const beginWindowInteraction = (event: PointerEvent, mode: "move" | "resize") =>
  {
    if (event.button !== 0 || currentWindow().state === "fullscreen")
    {
      return;
    }
    if (event.target instanceof Element && event.target.closest("button"))
    {
      return;
    }

    event.preventDefault();
    windowManager.focus(props.windowId);
    stopWindowInteraction?.();

    const startX = event.clientX;
    const startY = event.clientY;
    const { x, y, width, height } = currentWindow();
    const onMove = (moveEvent: PointerEvent) =>
    {
      const deltaX = Math.max(Math.min(moveEvent.clientX, window.innerWidth), 0) - startX;
      const deltaY = Math.max(Math.min(moveEvent.clientY, window.innerHeight - 49), 0) - startY;
      windowManager.updateFrame(
        props.windowId,
        mode === "move"
          ? { x: x + deltaX, y: y + deltaY }
          : { width: width + deltaX, height: height + deltaY },
      );
    };
    const stop = () =>
    {
      globalThis.window.removeEventListener("pointermove", onMove);
      globalThis.window.removeEventListener("pointerup", stop);
      globalThis.window.removeEventListener("pointercancel", stop);
      if (stopWindowInteraction === stop)
      {
        stopWindowInteraction = undefined;
      }
    };

    stopWindowInteraction = stop;
    globalThis.window.addEventListener("pointermove", onMove);
    globalThis.window.addEventListener("pointerup", stop, { once: true });
    globalThis.window.addEventListener("pointercancel", stop, { once: true });
  };

  onCleanup(() => stopWindowInteraction?.());

  return (
    <article
      classList={{
        "managed-window": true,
        fullscreen: currentWindow().state === "fullscreen",
        focused: props.windowId === windowManager.state.focusedWindowId,
      }}
      style={{
        left: currentWindow().state === "fullscreen" ? undefined : `${currentWindow().x}px`,
        top: currentWindow().state === "fullscreen" ? undefined : `${currentWindow().y}px`,
        width: currentWindow().state === "fullscreen"
          ? undefined
          : `${currentWindow().width}px`,
        height: currentWindow().state === "fullscreen"
          ? undefined
          : `${currentWindow().height}px`,
        "z-index": currentWindow().zIndex,
      }}
      onMouseDown={(event) =>
      {
        windowManager.focus(props.windowId);
        if (!(event.target instanceof Element) || !event.target.closest(".window-context-menu"))
        {
          setContextMenuPosition(undefined);
        }
      }}
    >
      <header
        class="window-titlebar"
        onPointerDown={(event) => beginWindowInteraction(event, "move")}
      >
        <div class="window-heading">
          <span class="window-app-icon">{currentWindow().title.slice(0, 1)}</span>
          <span>{currentWindow().title}</span>
        </div>
        <div class="window-controls">
          <button
            type="button"
            aria-label={`Minimize ${currentWindow().title}`}
            onClick={(event) =>
            {
              event.stopPropagation();
              windowManager.minimize(props.windowId);
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`${
              currentWindow().state === "fullscreen" ? "Exit fullscreen" : "Fullscreen"
            } ${currentWindow().title}`}
            aria-pressed={currentWindow().state === "fullscreen"}
            onClick={(event) =>
            {
              event.stopPropagation();
              windowManager.fullScreen(props.windowId);
            }}
          >
            □
          </button>
          <button
            class="close-button"
            type="button"
            aria-label={`Close ${currentWindow().title}`}
            onClick={(event) =>
            {
              event.stopPropagation();
              windowManager.close(props.windowId);
            }}
          >
            ×
          </button>
        </div>
      </header>
      <div class="window-decorator">
        <Show when={menus().length > 0}>
          <nav class="window-menu-bar" aria-label="Window menu">
            <For each={menus()}>
              {(category) => (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>{category.label}</DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content class="window-menu-items">
                      <For each={category.items}>
                        {(item) => (
                          <DropdownMenu.Item
                            class="window-menu-item"
                            disabled={item.disabled}
                            onSelect={item.onClick}
                          >
                            {item.label}
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </For>
          </nav>
        </Show>
        <div
          class="window-app-content"
          onContextMenu={openContextMenu}
          onClick={(event) =>
          {
            if (!(event.target instanceof Element) || !event.target.closest(".window-context-menu"))
            {
              setContextMenuPosition(undefined);
            }
          }}
        >
          {resolvedChildren()}
          <Show when={contextMenuPosition() && contextMenuItems().length > 0}>
            <div
              class="window-context-menu"
              role="menu"
              style={{
                left: `${contextMenuPosition()?.x ?? 0}px`,
                top: `${contextMenuPosition()?.y ?? 0}px`,
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <For each={contextMenuItems()}>
                {(item) => (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={(event) =>
                    {
                      event.stopPropagation();
                      setContextMenuPosition(undefined);
                      item.onClick();
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
      <div
        class="resize-handle"
        role="separator"
        aria-label={`Resize ${currentWindow().title}`}
        onPointerDown={(event) => beginWindowInteraction(event, "resize")}
      />
    </article>
  );
}
