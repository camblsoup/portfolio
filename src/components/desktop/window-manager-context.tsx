import type { JSX } from "solid-js";
import { createContext, onCleanup, useContext } from "solid-js";
import type { Store } from "solid-js/store";
import { createStore } from "solid-js/store";
import type { ChromeMenuCategory, ChromeMenuItem } from "../../kernel/app-registry/structure.ts";
import type { ManagedWindow, WindowFrameUpdate, WindowState } from "../../kernel/window-manager.ts";
import { useKernel } from "../kernel-provider.tsx";

export interface WindowView
{
  readonly id: number;
  readonly pid: number;
  readonly appId: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly state: WindowState;
  readonly zIndex: number;
}

interface WindowManagerState
{
  windows: WindowView[];
  focusedWindowId: number | null;
  menusByPid: Record<number, readonly ChromeMenuCategory[]>;
  contextMenusByPid: Record<number, readonly ChromeMenuItem[]>;
}

export interface WindowManagerContextValue
{
  kernel: ReturnType<typeof useKernel>;
  state: Store<WindowManagerState>;
  focus: (windowId: number) => void;
  minimize: (windowId: number) => void;
  fullScreen: (windowID: number) => void;
  close: (windowId: number) => void;
  updateFrame: (windowId: number, update: WindowFrameUpdate) => void;
}

const WindowManagerContext = createContext<WindowManagerContextValue>();

export function WindowManagerProvider(props: { children: JSX.Element })
{
  const kernel = useKernel();
  const windowManager = kernel.windowManager;
  const processManager = kernel.processManager;
  const [state, setState] = createStore<WindowManagerState>({
    windows: windowManager.getWindows().map(toWindowView),
    focusedWindowId: windowManager.getSnapshot().focusedWindowId,
    menusByPid: {},
    contextMenusByPid: {},
  });

  const unsubscribeWindows = windowManager.subscribe((snapshot) =>
  {
    setState("windows", snapshot.windows.map(toWindowView));
    setState("focusedWindowId", snapshot.focusedWindowId);
  });
  const unsubscribeMenus = processManager.subscribeMenus((pid, menus) =>
  {
    setState("menusByPid", pid, [...menus]);
  });
  const unsubscribeContextMenus = processManager.subscribeContextMenus((pid, items) =>
  {
    setState("contextMenusByPid", pid, [...items]);
  });

  onCleanup(() =>
  {
    unsubscribeWindows();
    unsubscribeMenus();
    unsubscribeContextMenus();
  });

  return (
    <WindowManagerContext.Provider
      value={{
        kernel,
        state,
        focus: (windowId) => windowManager.focus(windowId),
        minimize: (windowId) => windowManager.minimize(windowId),
        fullScreen: (windowId) => windowManager.fullScreen(windowId),
        close: (windowId) => kernel.closeWindow(windowId),
        updateFrame: (windowId, update) => windowManager.updateFrame(windowId, update),
      }}
    >
      {props.children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager(): WindowManagerContextValue
{
  const context = useContext(WindowManagerContext);
  if (!context)
  {
    throw new Error("Window manager context is missing.");
  }
  return context;
}

function toWindowView(window: ManagedWindow): WindowView
{
  return {
    id: window.id,
    pid: window.process.pid,
    appId: window.process.appId,
    title: window.process.manifest.name,
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    minWidth: window.minWidth,
    minHeight: window.minHeight,
    state: window.state,
    zIndex: window.zIndex,
  };
}
