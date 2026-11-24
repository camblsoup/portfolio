import type { AppManifest } from "./app-registry/structure.ts";
import type { FileSystemGrant } from "./process-context.ts";
import { ProcessManager, ProcessManagerOptions } from "./process-manager.ts";
import {
  BaseVFSNode,
  CanonicalPathSchema,
  NodeNameSchema,
  VFSError,
  VFSNodeType,
} from "./vfs/structure.ts";
import type { VFSChangeListener } from "./vfs/vfs.ts";
import { vfs } from "./vfs/vfs.ts";
import { ManagedWindow, WindowManager } from "./window-manager.ts";

const APP_BINARY_MIME_TYPE = "application/x-myos-app";
const APP_BINARY_FORMAT = "myos-app";
export const DESKTOP_DIRECTORY = "/home/Desktop";
// Stored as a UTF-8 IANA zone ID; browser APIs cannot consume Linux TZif files directly.
export const LOCAL_TIME_PATH = "/etc/localtime";
export const LOCALE_CONFIG_PATH = "/etc/locale.conf";
const SYSTEM_FILES_VERSION = 3;
const SYSTEM_FILES = import.meta.glob<string>("../system-files/**/*", {
  eager: true,
  query: "?inline",
  import: "default",
});

export interface KernelOptions
{
  registry?: ProcessManagerOptions["registry"];
  grantsForApp?: (manifest: AppManifest) => readonly FileSystemGrant[];
}

interface AppBinaryDescriptor
{
  format: typeof APP_BINARY_FORMAT;
  appId: string;
  version: 1;
}

export class Kernel
{
  readonly processManager: ProcessManager;
  readonly windowManager = new WindowManager();
  private readonly registry: ReadonlyMap<string, AppManifest>;
  private initialized = false;
  private localTimeZone = "UTC";
  private systemLocale = "en-US";

  constructor(options: KernelOptions = {})
  {
    this.registry = options.registry ?? new Map();
    this.processManager = new ProcessManager({
      ...options,
      registry: this.registry,
      grantsForApp: (manifest) => [
        ...(manifest.directoryHandler
          ? [
            { path: "/", actions: ["read", "list"] as const },
            { path: "/home", actions: ["read", "write", "list"] as const },
            { path: "/tmp", actions: ["read", "write", "list"] as const },
          ]
          : []),
        { path: LOCAL_TIME_PATH, actions: ["read"] },
        { path: LOCALE_CONFIG_PATH, actions: ["read"] },
        ...(options.grantsForApp?.(manifest) ?? []),
      ],
      openPath: async (path) =>
      {
        await this.openPath(path);
      },
      chooseSavePath: (requesterPid, suggestedName) =>
        this.chooseSavePath(requesterPid, suggestedName),
    });
    this.processManager.subscribe((processes) =>
    {
      const runningPids = new Set(processes.map((process) => process.pid));
      for (const window of this.windowManager.getWindows())
      {
        if (!runningPids.has(window.process.pid))
        {
          this.windowManager.close(window.id);
        }
      }
    });
  }

  async initialize(): Promise<void>
  {
    await vfs.ensureRoot();
    await this.ensureDirectory("/etc");
    await this.ensureFile(
      LOCAL_TIME_PATH,
      getBrowserTimeZone(),
      "text/plain",
    );
    this.localTimeZone = normalizeTimeZone(
      new TextDecoder().decode(await vfs.readContent(LOCAL_TIME_PATH)),
    );
    await this.ensureFile(
      LOCALE_CONFIG_PATH,
      serializeLocaleConfig(getBrowserLocale()),
      "text/plain",
    );
    await vfs.setPermissions(LOCAL_TIME_PATH, { read: true, write: false });
    await vfs.setPermissions(LOCALE_CONFIG_PATH, { read: true, write: false });
    this.systemLocale = parseLocaleConfig(
      new TextDecoder().decode(await vfs.readContent(LOCALE_CONFIG_PATH)),
    );
    await this.ensureDirectory("/system");
    await this.ensureDirectory("/system/apps");
    await this.ensureDirectory("/home");
    await this.ensureDirectory("/tmp");
    await this.ensureDirectory(DESKTOP_DIRECTORY);

    for (const manifest of this.registry.values())
    {
      if (manifest.binaryPath)
      {
        await this.ensureAppBinary(manifest, manifest.binaryPath);
      }
      if (manifest.desktopPath)
      {
        await this.ensureAppBinary(manifest, manifest.desktopPath);
      }
    }

    for (const [sourcePath, dataUrl] of Object.entries(SYSTEM_FILES))
    {
      const relativePath = sourcePath.replace(/^\.\.\/system-files\//, "");
      const path = `/${relativePath}`;
      const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
      const { content, mimeType } = decodeSystemFile(dataUrl, path);
      await this.ensureDirectory(parentPath);
      await this.ensureFile(path, content, mimeType, SYSTEM_FILES_VERSION);
    }

    this.initialized = true;
  }

  getLocalTimeZone(): string
  {
    this.assertInitialized();
    return this.localTimeZone;
  }

  async setLocalTimeZone(timeZone: string): Promise<void>
  {
    this.assertInitialized();
    const normalizedTimeZone = normalizeTimeZone(timeZone);
    await vfs.writeFile(
      LOCAL_TIME_PATH,
      new TextEncoder().encode(normalizedTimeZone),
      "text/plain",
    );
    this.localTimeZone = normalizedTimeZone;
  }

  getSystemLocale(): string
  {
    this.assertInitialized();
    return this.systemLocale;
  }

  async setSystemLocale(locale: string): Promise<void>
  {
    this.assertInitialized();
    const normalizedLocale = normalizeLocale(locale);
    await vfs.writeFile(
      LOCALE_CONFIG_PATH,
      new TextEncoder().encode(serializeLocaleConfig(normalizedLocale)),
      "text/plain",
    );
    this.systemLocale = normalizedLocale;
  }

  launchApp(appId: string): ManagedWindow | undefined
  {
    this.assertInitialized();
    const manifest = this.registry.get(appId);
    if (manifest?.link)
    {
      window.open(manifest.link.href, "_blank", "noopener,noreferrer");
      return;
    }

    const process = this.processManager.start(
      appId,
      manifest?.directoryHandler ? { openedDirectory: "/" } : {},
    );
    return this.windowManager.open(process);
  }

  subscribeFileSystemChanges(listener: VFSChangeListener): () => void
  {
    return vfs.subscribe(listener);
  }

  async listDirectory(
    path: string,
    sortPredicate?: (a: BaseVFSNode, b: BaseVFSNode) => number,
  )
  {
    this.assertInitialized();
    return await vfs.listDirectory(path, sortPredicate);
  }

  async openPath(path: string): Promise<ManagedWindow | undefined>
  {
    this.assertInitialized();
    const linkedApp = [...this.registry.values()].find((manifest) =>
      manifest.link && (manifest.desktopPath === path || manifest.binaryPath === path)
    );
    if (linkedApp)
    {
      return this.launchApp(linkedApp.id);
    }

    const node = await vfs.readMetadata(path);
    if (node.nodeType === VFSNodeType.DIRECTORY)
    {
      const directoryHandler = [...this.registry.values()].find(
        (manifest) => manifest.directoryHandler,
      );
      if (!directoryHandler)
      {
        throw new Error(`No registered app handles directories.`);
      }
      const process = this.processManager.start(directoryHandler.id, {
        openedDirectory: path,
      });
      return this.windowManager.open(process);
    }

    if (node.mimeType === APP_BINARY_MIME_TYPE)
    {
      const descriptor = await readAppBinary(path);
      const manifest = this.registry.get(descriptor.appId);
      if (!manifest)
      {
        throw new Error(`The app binary at '${path}' is not registered.`);
      }
      if (manifest.directoryHandler)
      {
        const process = this.processManager.start(manifest.id, { openedDirectory: "/" });
        return this.windowManager.open(process);
      }
      return this.launchApp(manifest.id);
    }

    const handler = [...this.registry.values()].find((manifest) =>
      manifest.fileAssociations?.some((association) => association.mimeType === node.mimeType)
    );
    const association = handler?.fileAssociations?.find(
      (candidate) => candidate.mimeType === node.mimeType,
    );
    if (!handler || !association)
    {
      throw new Error(`No registered app handles '${node.mimeType}'.`);
    }

    const process = this.processManager.start(handler.id, {
      openedFile: path,
      openedFileActions: association.actions,
    });
    return this.windowManager.open(process);
  }

  closeWindow(windowId: number): boolean
  {
    const window = this.windowManager.close(windowId);
    if (!window)
    {
      return false;
    }

    if (
      !this.windowManager.getWindows().some(
        (remaining) => remaining.process.pid === window.process.pid,
      )
    )
    {
      this.processManager.stop(window.process.pid);
    }
    return true;
  }

  terminateProcess(pid: number): boolean
  {
    return this.processManager.stop(pid);
  }

  private chooseSavePath(
    requesterPid: number,
    suggestedName: string,
  ): Promise<string | undefined>
  {
    this.assertInitialized();
    const fileManager = [...this.registry.values()].find((manifest) => manifest.directoryHandler);
    if (!fileManager)
    {
      return Promise.reject(new Error("No file manager is registered."));
    }

    const validatedName = NodeNameSchema.parse(suggestedName);
    if (validatedName.includes("/"))
    {
      return Promise.reject(new Error("Save name must be a file name, not a path."));
    }

    return new Promise((resolve, reject) =>
    {
      let settled = false;
      let pickerPid: number | undefined;
      let unsubscribeRequester: (() => void) | undefined;

      const stopPicker = () =>
      {
        if (pickerPid !== undefined && this.processManager.get(pickerPid))
        {
          this.processManager.stop(pickerPid);
        }
      };

      const finish = async (selectedPath?: string) =>
      {
        if (settled)
        {
          return;
        }
        settled = true;
        unsubscribeRequester?.();

        try
        {
          if (!selectedPath)
          {
            resolve(undefined);
            return;
          }

          const path = CanonicalPathSchema.parse(selectedPath);
          const fileName = path.slice(path.lastIndexOf("/") + 1);
          if (fileName.includes("/"))
          {
            throw new Error("Save path must end in a file name.");
          }
          NodeNameSchema.parse(fileName);

          const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
          const parent = await vfs.readMetadata(parentPath);
          if (parent.nodeType !== VFSNodeType.DIRECTORY)
          {
            throw new Error(`'${parentPath}' is not a directory.`);
          }
          const existing = await findNode(path);
          if (existing?.nodeType === VFSNodeType.DIRECTORY)
          {
            throw new Error(`'${path}' is a directory.`);
          }

          this.processManager.grantFileSystemAccess(requesterPid, {
            path,
            actions: ["read", "write"],
          });
          resolve(path);
        }
        catch (error)
        {
          reject(error);
        }
        finally
        {
          stopPicker();
        }
      };

      const picker = this.processManager.start(fileManager.id, {
        openedDirectory: "/tmp",
        saveDialog: {
          suggestedName: validatedName,
          select: (path) => void finish(path),
          cancel: () => void finish(),
        },
      });
      pickerPid = picker.pid;
      unsubscribeRequester = this.processManager.subscribe((processes) =>
      {
        if (!processes.some((process) => process.pid === requesterPid))
        {
          void finish();
        }
      });
      this.windowManager.open(picker);
    });
  }

  private async ensureDirectory(path: string): Promise<void>
  {
    const existing = await findNode(path);
    if (existing)
    {
      if (existing.nodeType !== VFSNodeType.DIRECTORY)
      {
        throw new Error(`Expected '${path}' to be a directory.`);
      }
      return;
    }

    const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
    if (parentPath !== path)
    {
      await this.ensureDirectory(parentPath);
    }
    await vfs.createDirectory(path);
  }

  private async ensureFile(
    path: string,
    content: string | Uint8Array,
    mimeType: string,
    sourceVersion?: number,
  ): Promise<void>
  {
    const existing = await findNode(path);
    if (existing)
    {
      if (existing.nodeType !== VFSNodeType.FILE)
      {
        throw new Error(`Expected '${path}' to be a file.`);
      }
      if (
        sourceVersion === undefined
        || (existing.sourceVersion !== undefined && existing.sourceVersion >= sourceVersion)
      )
      {
        return;
      }
    }
    await vfs.writeFile(
      path,
      typeof content === "string" ? new TextEncoder().encode(content) : content,
      mimeType,
      sourceVersion,
    );
  }

  private async ensureAppBinary(manifest: AppManifest, binaryPath: string): Promise<void>
  {
    const parentPath = binaryPath.slice(0, binaryPath.lastIndexOf("/")) || "/";
    await this.ensureDirectory(parentPath);
    await this.ensureFile(
      binaryPath,
      JSON.stringify(
        {
          format: APP_BINARY_FORMAT,
          appId: manifest.id,
          version: 1,
        } satisfies AppBinaryDescriptor,
      ),
      APP_BINARY_MIME_TYPE,
    );
  }

  private assertInitialized(): void
  {
    if (!this.initialized)
    {
      throw new Error("Kernel must be initialized before accessing files or apps.");
    }
  }
}

function getBrowserTimeZone(): string
{
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
}

function normalizeTimeZone(timeZone: string): string
{
  const candidate = timeZone.trim();
  if (!candidate)
  {
    throw new Error("Time zone cannot be empty.");
  }

  try
  {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate })
      .resolvedOptions().timeZone;
  }
  catch
  {
    throw new Error(`Invalid IANA time zone '${candidate}'.`);
  }
}

function getBrowserLocale(): string
{
  return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale || "en-US");
}

function normalizeLocale(locale: string): string
{
  const candidate = locale.trim();
  if (!candidate)
  {
    throw new Error("Locale cannot be empty.");
  }

  try
  {
    return Intl.getCanonicalLocales(candidate)[0];
  }
  catch
  {
    throw new Error(`Invalid locale '${candidate}'.`);
  }
}

function serializeLocaleConfig(locale: string): string
{
  return `LANG=${normalizeLocale(locale).replaceAll("-", "_")}.UTF-8\n`;
}

function parseLocaleConfig(config: string): string
{
  const langLine = config.split(/\r?\n/).map((line) => line.trim()).find((line) =>
    line.startsWith("LANG=")
  );
  if (!langLine)
  {
    throw new Error("/etc/locale.conf must define LANG.");
  }

  const locale = langLine.slice("LANG=".length).replace(/\.UTF-8$/i, "");
  return normalizeLocale(locale.replaceAll("_", "-"));
}

function decodeSystemFile(
  dataUrl: string,
  path: string,
): { content: Uint8Array; mimeType: string }
{
  const separator = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || separator < 0)
  {
    throw new Error(`Unable to import bundled system file '${path}'.`);
  }

  const metadata = dataUrl.slice("data:".length, separator).split(";");
  const embeddedMimeType = metadata[0] || "application/octet-stream";
  const payload = dataUrl.slice(separator + 1);
  let content: Uint8Array;
  if (metadata.includes("base64"))
  {
    const binary = atob(payload);
    content = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  else
  {
    content = new TextEncoder().encode(decodeURIComponent(payload));
  }

  return { content, mimeType: systemFileMimeType(path, embeddedMimeType) };
}

function systemFileMimeType(path: string, embeddedMimeType: string): string
{
  const normalizedPath = path.toLowerCase();
  if (normalizedPath.endsWith(".md"))
  {
    return "text/markdown";
  }
  if (/\.(?:conf|cfg|config|env|ini|json|properties|toml|txt|text|ya?ml)$/.test(normalizedPath))
  {
    return "text/plain";
  }
  if (embeddedMimeType.startsWith("text/"))
  {
    return "text/plain";
  }
  return embeddedMimeType;
}

async function findNode(path: string)
{
  try
  {
    return await vfs.readMetadata(path);
  }
  catch (error)
  {
    if (error instanceof VFSError && error.code === "ENOENT")
    {
      return undefined;
    }
    throw error;
  }
}

async function readAppBinary(path: string): Promise<AppBinaryDescriptor>
{
  const bytes = await vfs.readContent(path);
  let descriptor: unknown;
  try
  {
    descriptor = JSON.parse(new TextDecoder().decode(bytes));
  }
  catch
  {
    throw new Error(`Invalid app binary at '${path}'.`);
  }

  if (
    typeof descriptor !== "object"
    || descriptor === null
    || !("format" in descriptor)
    || descriptor.format !== APP_BINARY_FORMAT
    || !("appId" in descriptor)
    || typeof descriptor.appId !== "string"
    || !("version" in descriptor)
    || descriptor.version !== 1
  )
  {
    throw new Error(`Invalid app binary at '${path}'.`);
  }
  return descriptor as AppBinaryDescriptor;
}
