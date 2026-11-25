import {
  AppBridge,
  AppManifest,
  ChromeMenuCategory,
  ChromeMenuItem,
  SaveDialogBridge,
} from "./app-registry/structure.ts";
import { createProcessContext, FileSystemAction, FileSystemGrant } from "./process-context.ts";
import { ProcessFileSystem, vfs } from "./vfs/vfs.ts";

export class ProcessManagerError extends Error
{
  constructor(
    public code: "APP_NOT_FOUND" | "PROCESS_TERMINATED" | "PERMISSION_DENIED",
    message: string,
  )
  {
    super(message);
    this.name = "ProcessManagerError";
  }
}

export interface ManagedProcess
{
  readonly pid: number;
  readonly appId: string;
  readonly manifest: AppManifest;
  readonly bridge: AppBridge;
  readonly startedAt: number;
}

export interface ProcessManagerOptions
{
  registry?: ReadonlyMap<string, AppManifest>;
  grantsForApp?: (manifest: AppManifest) => readonly FileSystemGrant[];
  openPath?: (path: string) => Promise<void>;
  chooseSavePath?: (requesterPid: number, suggestedName: string) => Promise<string | undefined>;
  resetSystem?: () => Promise<void>;
}

export type ProcessListener = (processes: readonly ManagedProcess[]) => void;
export type MenuListener = (pid: number, menus: readonly ChromeMenuCategory[]) => void;
export type ContextMenuListener = (pid: number, items: readonly ChromeMenuItem[]) => void;

interface ProcessEntry
{
  process: ManagedProcess;
  additionalGrants: FileSystemGrant[];
  revoke: () => void;
}

export class ProcessManager
{
  private readonly registry: ReadonlyMap<string, AppManifest>;
  private readonly grantsForApp: (manifest: AppManifest) => readonly FileSystemGrant[];
  private readonly openPath: (path: string) => Promise<void>;
  private readonly chooseSavePath: (
    requesterPid: number,
    suggestedName: string,
  ) => Promise<string | undefined>;
  private readonly resetSystem: () => Promise<void>;
  private readonly processes = new Map<number, ProcessEntry>();
  private readonly menus = new Map<number, ChromeMenuCategory[]>();
  private readonly contextMenus = new Map<number, ChromeMenuItem[]>();
  private readonly listeners = new Set<ProcessListener>();
  private readonly menuListeners = new Set<MenuListener>();
  private readonly contextMenuListeners = new Set<ContextMenuListener>();
  private nextPid = 1;

  constructor(options: ProcessManagerOptions = {})
  {
    this.registry = options.registry ?? new Map();
    this.grantsForApp = options.grantsForApp ?? (() => []);
    this.openPath = options.openPath ?? (async (path) =>
    {
      throw new Error(`No kernel path handler is configured for '${path}'.`);
    });
    this.chooseSavePath = options.chooseSavePath ?? (async () =>
    {
      throw new Error("No save-path service is configured.");
    });
    this.resetSystem = options.resetSystem ?? (async () =>
    {
      throw new Error("No system reset service is configured.");
    });
  }

  start(
    appId: string,
    options: {
      openedFile?: string;
      openedFileActions?: readonly FileSystemAction[];
      openedDirectory?: string;
      saveDialog?: SaveDialogBridge;
    } = {},
  ): ManagedProcess
  {
    const manifest = this.registry.get(appId);
    if (!manifest)
    {
      throw new ProcessManagerError("APP_NOT_FOUND", `No registered app '${appId}'.`);
    }

    if (manifest.constraints?.singleton && !options.openedFile && !options.openedDirectory)
    {
      const existing = this.getProcesses().find((process) => process.appId === appId);
      if (existing)
      {
        return existing;
      }
    }

    const pid = this.nextPid;
    const fileSystemGrants: FileSystemGrant[] = [...this.grantsForApp(manifest)];
    if (options.openedFile)
    {
      fileSystemGrants.push({
        path: options.openedFile,
        actions: options.openedFileActions ?? ["read"],
      });
    }
    if (options.openedDirectory)
    {
      fileSystemGrants.push({
        path: options.openedDirectory,
        actions: ["read", "list"],
      });
    }
    const context = createProcessContext({
      pid,
      appId,
      fileSystemGrants,
    });
    const additionalGrants: FileSystemGrant[] = [];
    let active = true;
    const assertActive = () =>
    {
      if (!active)
      {
        throw new ProcessManagerError(
          "PROCESS_TERMINATED",
          `Process ${pid} has terminated.`,
        );
      }
    };
    const fileSystem = createGuardedFileSystem(
      vfs.forProcess(context, () => additionalGrants),
      assertActive,
    );
    const bridge: AppBridge = Object.freeze({
      pid,
      fileSystem,
      openedFile: options.openedFile,
      openedDirectory: options.openedDirectory,
      saveDialog: options.saveDialog,
      openPath: async (path: string) =>
      {
        assertActive();
        await this.openPath(path);
      },
      chooseSavePath: async (suggestedName: string) =>
      {
        assertActive();
        return await this.chooseSavePath(pid, suggestedName);
      },
      setMenus: (menus: ChromeMenuCategory[]) =>
      {
        assertActive();
        this.menus.set(pid, menus);
        this.notifyMenus(pid);
      },
      setContextMenu: (items: ChromeMenuItem[]) =>
      {
        assertActive();
        this.contextMenus.set(pid, items);
        this.notifyContextMenu(pid);
      },
      close: () =>
      {
        assertActive();
        this.stop(pid);
      },
      resetSystem: async () =>
      {
        assertActive();
        if (!manifest.capabilities?.resetSystem)
        {
          throw new ProcessManagerError(
            "PERMISSION_DENIED",
            `App '${appId}' is not permitted to reset the system.`,
          );
        }
        await this.resetSystem();
      },
    });
    const process: ManagedProcess = Object.freeze({
      pid,
      appId,
      manifest,
      bridge,
      startedAt: Date.now(),
    });

    this.nextPid += 1;
    this.processes.set(pid, {
      process,
      additionalGrants,
      revoke: () =>
      {
        active = false;
      },
    });
    this.notify();
    return process;
  }

  stop(pid: number): boolean
  {
    const entry = this.processes.get(pid);
    if (!entry)
    {
      return false;
    }

    entry.revoke();
    this.processes.delete(pid);
    this.menus.delete(pid);
    this.contextMenus.delete(pid);
    entry.process.bridge.saveDialog?.cancel();
    this.notifyMenus(pid);
    this.notifyContextMenu(pid);
    this.notify();
    return true;
  }

  grantFileSystemAccess(pid: number, grant: FileSystemGrant): void
  {
    const entry = this.processes.get(pid);
    if (!entry)
    {
      throw new ProcessManagerError("PROCESS_TERMINATED", `Process ${pid} has terminated.`);
    }

    const [validatedGrant] = createProcessContext({
      pid,
      appId: entry.process.appId,
      fileSystemGrants: [grant],
    }).fileSystemGrants;
    entry.additionalGrants.push(validatedGrant);
  }

  get(pid: number): ManagedProcess | undefined
  {
    return this.processes.get(pid)?.process;
  }

  getProcesses(): readonly ManagedProcess[]
  {
    return [...this.processes.values()]
      .map(({ process }) => process)
      .toSorted((a, b) => a.pid - b.pid);
  }

  getMenus(pid: number): readonly ChromeMenuCategory[]
  {
    return this.menus.get(pid) ?? [];
  }

  subscribe(listener: ProcessListener): () => void
  {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeMenus(listener: MenuListener): () => void
  {
    this.menuListeners.add(listener);
    return () => this.menuListeners.delete(listener);
  }

  getContextMenu(pid: number): readonly ChromeMenuItem[]
  {
    return this.contextMenus.get(pid) ?? [];
  }

  subscribeContextMenus(listener: ContextMenuListener): () => void
  {
    this.contextMenuListeners.add(listener);
    return () => this.contextMenuListeners.delete(listener);
  }

  private notifyContextMenu(pid: number): void
  {
    const items = this.getContextMenu(pid);
    for (const listener of this.contextMenuListeners)
    {
      listener(pid, items);
    }
  }

  private notifyMenus(pid: number): void
  {
    const menus = this.getMenus(pid);
    for (const listener of this.menuListeners)
    {
      listener(pid, menus);
    }
  }

  private notify(): void
  {
    const processes = this.getProcesses();
    for (const listener of this.listeners)
    {
      listener(processes);
    }
  }
}

function createGuardedFileSystem(
  fileSystem: ProcessFileSystem,
  assertActive: () => void,
): ProcessFileSystem
{
  return {
    async readMetadata(path)
    {
      assertActive();
      return await fileSystem.readMetadata(path);
    },
    async readContent(path)
    {
      assertActive();
      return await fileSystem.readContent(path);
    },
    async listDirectory(path)
    {
      assertActive();
      return await fileSystem.listDirectory(path);
    },
    async writeFile(path, content, mimeType)
    {
      assertActive();
      return await fileSystem.writeFile(path, content, mimeType);
    },
    async createDirectory(path)
    {
      assertActive();
      return await fileSystem.createDirectory(path);
    },
    async delete(path)
    {
      assertActive();
      return await fileSystem.delete(path);
    },
    async move(sourcePath, destinationPath)
    {
      assertActive();
      return await fileSystem.move(sourcePath, destinationPath);
    },
  };
}
