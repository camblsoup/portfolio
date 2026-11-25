import { ManagedProcess } from "./process-manager.ts";

export type WindowState = "normal" | "fullscreen" | "minimized";

export interface ManagedWindow
{
  readonly id: number;
  readonly process: ManagedProcess;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly state: WindowState;
  readonly restoreState: Exclude<WindowState, "minimized">;
  readonly zIndex: number;
}

export interface WindowManagerSnapshot
{
  readonly windows: readonly ManagedWindow[];
  readonly focusedWindowId: number | null;
}

export type WindowListener = (snapshot: WindowManagerSnapshot) => void;

export interface WindowFrameUpdate
{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class WindowManager
{
  private readonly windows = new Map<number, ManagedWindow>();
  private readonly listeners = new Set<WindowListener>();
  private nextWindowId = 1;
  private zIndex = 0;
  private focusedWindowId: number | null = null;

  open(process: ManagedProcess): ManagedWindow
  {
    if (process.manifest.constraints?.singleton)
    {
      const existing = [...this.windows.values()].find(
        (window) => window.process.pid === process.pid,
      );
      if (existing)
      {
        this.focus(existing.id);
        return this.windows.get(existing.id)!;
      }
    }

    const config = process.manifest.defaultWindowConfig;
    const offset = (this.windows.size % 7) * 28;
    const id = this.nextWindowId++;
    const window: ManagedWindow = Object.freeze({
      id,
      process,
      x: 32 + offset,
      y: 32 + offset,
      width: config?.width ?? 220,
      height: config?.height ?? 140,
      minWidth: config?.minWidth ?? 220,
      minHeight: config?.minHeight ?? 140,
      state: "normal",
      restoreState: "normal",
      zIndex: ++this.zIndex,
    });

    this.windows.set(id, window);
    this.focusedWindowId = id;
    this.notify();
    return window;
  }

  focus(id: number): boolean
  {
    const window = this.windows.get(id);
    if (!window)
    {
      return false;
    }
    if (this.focusedWindowId === id && window.state !== "minimized")
    {
      return true;
    }

    this.windows.set(
      id,
      Object.freeze({
        ...window,
        state: window.state === "minimized" ? window.restoreState : window.state,
        zIndex: ++this.zIndex,
      }),
    );
    this.focusedWindowId = id;
    this.notify();
    return true;
  }

  minimize(id: number): boolean
  {
    const window = this.windows.get(id);
    if (!window)
    {
      return false;
    }

    this.windows.set(
      id,
      Object.freeze({
        ...window,
        state: "minimized",
        restoreState: window.state === "minimized" ? window.restoreState : window.state,
      }),
    );
    if (this.focusedWindowId === id)
    {
      this.focusTopmostVisible();
    }
    this.notify();
    return true;
  }

  fullScreen(id: number): boolean
  {
    const window = this.windows.get(id);
    if (!window)
    {
      return false;
    }

    this.windows.set(
      id,
      Object.freeze({
        ...window,
        state: window.state === "fullscreen" ? "normal" : "fullscreen",
        restoreState: window.state === "fullscreen" ? "normal" : "fullscreen",
        zIndex: ++this.zIndex,
      }),
    );
    this.focusedWindowId = id;
    this.notify();
    return true;
  }

  close(id: number): ManagedWindow | undefined
  {
    const window = this.windows.get(id);
    if (!window)
    {
      return undefined;
    }

    this.windows.delete(id);
    if (this.focusedWindowId === id)
    {
      this.focusTopmostVisible();
    }
    this.notify();
    return window;
  }

  closeForProcess(pid: number): void
  {
    let changed = false;
    for (const [id, window] of this.windows)
    {
      if (window.process.pid === pid)
      {
        this.windows.delete(id);
        changed = true;
      }
    }
    if (!changed)
    {
      return;
    }

    if (
      this.focusedWindowId !== null
      && !this.windows.has(this.focusedWindowId)
    )
    {
      this.focusTopmostVisible();
    }
    this.notify();
  }

  updateFrame(id: number, update: WindowFrameUpdate): boolean
  {
    const window = this.windows.get(id);
    if (!window)
    {
      return false;
    }

    this.windows.set(
      id,
      Object.freeze({
        ...window,
        ...update,
        width: Math.max(window.minWidth, update.width ?? window.width),
        height: Math.max(window.minHeight, update.height ?? window.height),
      }),
    );
    this.notify();
    return true;
  }

  getWindow(id: number): ManagedWindow | undefined
  {
    return this.windows.get(id);
  }

  getWindows(): readonly ManagedWindow[]
  {
    return [...this.windows.values()].toSorted((a, b) => a.zIndex - b.zIndex);
  }

  getSnapshot(): WindowManagerSnapshot
  {
    return Object.freeze({
      windows: this.getWindows(),
      focusedWindowId: this.focusedWindowId,
    });
  }

  subscribe(listener: WindowListener): () => void
  {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private focusTopmostVisible(): void
  {
    const topmost = [...this.windows.values()]
      .filter((window) => window.state !== "minimized")
      .toSorted((a, b) => b.zIndex - a.zIndex)[0];
    this.focusedWindowId = topmost?.id ?? null;
  }

  private notify(): void
  {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners)
    {
      listener(snapshot);
    }
  }
}
