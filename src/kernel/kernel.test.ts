import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { AppManifest } from "./app-registry/structure.ts";
import { DESKTOP_DIRECTORY, Kernel, LOCAL_TIME_PATH, LOCALE_CONFIG_PATH } from "./kernel.ts";
import { ProcessManager, ProcessManagerError } from "./process-manager.ts";
import { vfs } from "./vfs/vfs.ts";
import { WindowManager } from "./window-manager.ts";

const testFilesApp: AppManifest = {
  id: "test.files",
  name: "Files",
  icon: "",
  binaryPath: "/system/apps/test-files.app",
  desktopPath: `${DESKTOP_DIRECTORY}/Files.app`,
  directoryHandler: true,
  defaultWindowConfig: { width: 400, height: 300 },
  component: () => null,
};

const testApp: AppManifest = {
  id: "test.app",
  name: "Test App",
  icon: "",
  binaryPath: "/system/apps/test.app",
  fileAssociations: [
    { mimeType: "text/plain", actions: ["read", "write"] },
    { mimeType: "text/markdown", actions: ["read", "write"] },
  ],
  defaultWindowConfig: {
    width: 400,
    height: 260,
    minWidth: 240,
    minHeight: 160,
  },
  constraints: { singleton: true },
  component: () => null,
};

function makeProcessManager()
{
  return new ProcessManager({
    registry: new Map([[testApp.id, testApp]]),
  });
}

describe("Kernel process and window lifecycle", () =>
{
  it("starts registered apps once when their manifest is singleton", () =>
  {
    const processes = makeProcessManager();
    const first = processes.start(testApp.id);
    const second = processes.start(testApp.id);

    expect(second.pid).toBe(first.pid);
    expect(processes.getProcesses()).toHaveLength(1);
  });

  it("publishes app menus and context menus and clears them on stop", () =>
  {
    const processes = makeProcessManager();
    const process = processes.start(testApp.id);
    let lastMenuCount = -1;
    let lastContextMenuCount = -1;
    const unsubscribe = processes.subscribeMenus((pid, menus) =>
    {
      if (pid === process.pid)
      {
        lastMenuCount = menus.length;
      }
    });
    const unsubscribeContextMenus = processes.subscribeContextMenus((pid, items) =>
    {
      if (pid === process.pid)
      {
        lastContextMenuCount = items.length;
      }
    });

    process.bridge.setMenus([{
      label: "File",
      items: [{
        label: "Save",
        onClick: () =>
        {},
      }],
    }]);
    expect(processes.getMenus(process.pid)).toHaveLength(1);
    expect(lastMenuCount).toBe(1);

    process.bridge.setContextMenu([{
      label: "Delete",
      onClick: () =>
      {},
    }]);
    expect(processes.getContextMenu(process.pid)).toHaveLength(1);
    expect(lastContextMenuCount).toBe(1);

    processes.stop(process.pid);
    expect(lastMenuCount).toBe(0);
    expect(lastContextMenuCount).toBe(0);
    unsubscribe();
    unsubscribeContextMenus();
  });

  it("revokes the process filesystem when a process stops", async () =>
  {
    const processes = makeProcessManager();
    const process = processes.start(testApp.id);

    expect(processes.stop(process.pid)).toBe(true);
    await expect(process.bridge.fileSystem.readContent("/private/file"))
      .rejects.toMatchObject({ code: "PROCESS_TERMINATED" });
    expect(processes.stop(process.pid)).toBe(false);
  });

  it("focuses, minimizes, restores, resizes, and closes windows", () =>
  {
    const processes = makeProcessManager();
    const process = processes.start(testApp.id);
    const windows = new WindowManager();
    const window = windows.open(process);

    expect(windows.getSnapshot().focusedWindowId).toBe(window.id);
    expect(windows.focus(window.id)).toBe(true);
    expect(windows.getWindow(window.id)).toBe(window);
    expect(windows.minimize(window.id)).toBe(true);
    expect(windows.getSnapshot().focusedWindowId).toBeNull();
    expect(windows.focus(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("normal");

    expect(windows.fullScreen(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("fullscreen");
    expect(windows.focus(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("fullscreen");
    expect(windows.fullScreen(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("normal");

    expect(windows.fullScreen(window.id)).toBe(true);
    expect(windows.minimize(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("minimized");
    expect(windows.focus(window.id)).toBe(true);
    expect(windows.getWindow(window.id)?.state).toBe("fullscreen");
    expect(windows.fullScreen(window.id)).toBe(true);

    windows.updateFrame(window.id, { width: 100, height: 100 });
    expect(windows.getWindow(window.id)?.width).toBe(testApp.defaultWindowConfig?.minWidth);
    expect(windows.getWindow(window.id)?.height).toBe(testApp.defaultWindowConfig?.minHeight);

    expect(windows.close(window.id)?.process.pid).toBe(process.pid);
    expect(windows.getWindows()).toHaveLength(0);
  });

  it("persists the local time zone and locale for read-only app access", async () =>
  {
    const kernel = new Kernel({ registry: new Map([[testApp.id, testApp]]) });
    await kernel.initialize();
    await kernel.setLocalTimeZone("Europe/Berlin");
    await kernel.setSystemLocale("de-DE");

    expect(kernel.getLocalTimeZone()).toBe("Europe/Berlin");
    expect(kernel.getSystemLocale()).toBe("de-DE");
    const process = kernel.processManager.start(testApp.id);
    const localTime = await process.bridge.fileSystem.readContent(LOCAL_TIME_PATH);
    expect(new TextDecoder().decode(localTime)).toBe("Europe/Berlin");
    const localeConfig = await process.bridge.fileSystem.readContent(LOCALE_CONFIG_PATH);
    expect(new TextDecoder().decode(localeConfig)).toBe("LANG=de_DE.UTF-8\n");
    await expect(process.bridge.fileSystem.writeFile(
      LOCALE_CONFIG_PATH,
      new TextEncoder().encode("LANG=en_US.UTF-8\n"),
    )).rejects.toMatchObject({ code: "EACCES" });
    await expect(process.bridge.fileSystem.writeFile(
      LOCAL_TIME_PATH,
      new TextEncoder().encode("UTC"),
    )).rejects.toMatchObject({ code: "EACCES" });

    const localeWindow = (await kernel.openPath(LOCALE_CONFIG_PATH))!;
    await expect(localeWindow.process.bridge.fileSystem.writeFile(
      LOCALE_CONFIG_PATH,
      new TextEncoder().encode("LANG=en_US.UTF-8\n"),
      "text/plain",
    )).rejects.toMatchObject({ code: "EACCES" });
    await expect(kernel.setLocalTimeZone("not/a-time-zone"))
      .rejects.toThrow(/invalid iana time zone/i);
    await expect(kernel.setSystemLocale("invalid_locale"))
      .rejects.toThrow(/invalid locale/i);
    expect(kernel.getLocalTimeZone()).toBe("Europe/Berlin");
    expect(kernel.getSystemLocale()).toBe("de-DE");

    const restartedKernel = new Kernel({ registry: new Map([[testApp.id, testApp]]) });
    await restartedKernel.initialize();
    expect(restartedKernel.getLocalTimeZone()).toBe("Europe/Berlin");
    expect(restartedKernel.getSystemLocale()).toBe("de-DE");
  });

  it("allows only authorized apps to reset and reinitialize the file system", async () =>
  {
    const resetApp: AppManifest = {
      ...testApp,
      id: "test.reset",
      name: "Reset",
      capabilities: { resetSystem: true },
    };
    const kernel = new Kernel({
      registry: new Map([[testApp.id, testApp], [resetApp.id, resetApp]]),
    });
    await kernel.initialize();

    const ordinaryProcess = kernel.processManager.start(testApp.id);
    await expect(ordinaryProcess.bridge.resetSystem()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });

    await vfs.writeFile(
      `${DESKTOP_DIRECTORY}/changed.txt`,
      new TextEncoder().encode("modified"),
      "text/plain",
    );
    const resetProcess = kernel.processManager.start(resetApp.id);
    await resetProcess.bridge.resetSystem();

    await expect(vfs.readMetadata(`${DESKTOP_DIRECTORY}/changed.txt`))
      .rejects.toThrow("File not found");
    await expect(vfs.readMetadata(testApp.binaryPath!)).resolves.toMatchObject({
      name: "test.app",
    });
  });

  it("opens directories in a scoped file manager and lets it dispatch files", async () =>
  {
    const registry = new Map([
      [testApp.id, testApp],
      [testFilesApp.id, testFilesApp],
    ]);
    const kernel = new Kernel({ registry });
    await kernel.initialize();

    const shortcutPath = `${DESKTOP_DIRECTORY}/Files.app`;
    const shortcut = (await kernel.openPath(shortcutPath))!;
    expect(shortcut.process.appId).toBe(testFilesApp.id);
    expect(shortcut.process.bridge.openedDirectory).toBe("/");

    const fileManagerWindow = (await kernel.openPath(DESKTOP_DIRECTORY))!;
    expect(fileManagerWindow.process.appId).toBe(testFilesApp.id);
    expect(fileManagerWindow.process.bridge.openedDirectory).toBe(DESKTOP_DIRECTORY);
    const entries = await fileManagerWindow.process.bridge.fileSystem.listDirectory(
      DESKTOP_DIRECTORY,
    );
    expect(entries.map((entry) => entry.name)).toContain("WELCOME.MD");
    expect(await vfs.readMetadata(`${DESKTOP_DIRECTORY}/WELCOME.MD`)).toMatchObject({
      mimeType: "text/markdown",
      sourceVersion: 2,
    });
    expect(new TextDecoder().decode(await vfs.readContent(`${DESKTOP_DIRECTORY}/WELCOME.MD`)))
      .toContain("Hi, I'm Cameron");

    await fileManagerWindow.process.bridge.openPath(`${DESKTOP_DIRECTORY}/WELCOME.MD`);
    expect(
      kernel.processManager.getProcesses().some((process) =>
        process.appId === testApp.id
        && process.bridge.openedFile === `${DESKTOP_DIRECTORY}/WELCOME.MD`
      ),
    ).toBe(true);
  });

  it("updates bundled files when their source version advances", async () =>
  {
    const path = `${DESKTOP_DIRECTORY}/WELCOME.md`;
    const kernel = new Kernel({ registry: new Map() });
    await kernel.initialize();

    await vfs.writeFile(
      path,
      new TextEncoder().encode("stale bundled welcome"),
      "text/plain",
      0,
    );

    const restartedKernel = new Kernel({ registry: new Map() });
    await restartedKernel.initialize();
    const updatedContent = await vfs.readContent(path);
    expect(new TextDecoder().decode(updatedContent)).not.toBe("stale bundled welcome");
    expect(await vfs.readMetadata(path)).toMatchObject({ sourceVersion: 2 });

    await vfs.writeFile(path, new TextEncoder().encode("user edit"), "text/plain");
    const nextKernel = new Kernel({ registry: new Map() });
    await nextKernel.initialize();
    await expect(vfs.readContent(path)).resolves.toEqual(new TextEncoder().encode("user edit"));
  });

  it("opens Files for Save As and grants access only to the chosen path", async () =>
  {
    const registry = new Map([
      [testApp.id, testApp],
      [testFilesApp.id, testFilesApp],
    ]);
    const kernel = new Kernel({ registry });
    await kernel.initialize();

    const notes = kernel.processManager.start(testApp.id);
    const selectedPath = notes.bridge.chooseSavePath("new-note.txt");
    const picker = kernel.processManager.getProcesses().find((process) =>
      process.pid !== notes.pid
    )!;
    expect(picker.bridge.saveDialog?.suggestedName).toBe("new-note.txt");
    picker.bridge.saveDialog?.select("/tmp/new-note.txt");

    await expect(selectedPath).resolves.toBe("/tmp/new-note.txt");
    await notes.bridge.fileSystem.writeFile(
      "/tmp/new-note.txt",
      new TextEncoder().encode("saved note"),
      "text/plain",
    );
    await expect(notes.bridge.fileSystem.readContent("/tmp/new-note.txt"))
      .resolves.toEqual(new TextEncoder().encode("saved note"));
    await expect(notes.bridge.fileSystem.writeFile(
      "/tmp/other-note.txt",
      new Uint8Array(),
    )).rejects.toMatchObject({ code: "EACCES" });
    expect(kernel.processManager.get(picker.pid)).toBeUndefined();
  });

  it("opens app binaries and dispatches ordinary files to their MIME handler", async () =>
  {
    const kernel = new Kernel({ registry: new Map([[testApp.id, testApp]]) });
    await kernel.initialize();

    const binaryWindow = (await kernel.openPath("/system/apps/test.app"))!;
    expect(binaryWindow.process.appId).toBe(testApp.id);
    expect(binaryWindow.process.bridge.openedFile).toBeUndefined();

    const documentWindow = (await kernel.openPath("/home/Desktop/WELCOME.txt"))!;
    expect(documentWindow.process.appId).toBe(testApp.id);
    expect(documentWindow.process.bridge.openedFile).toBe("/home/Desktop/WELCOME.txt");
    const fileSystem = documentWindow.process.bridge.fileSystem;
    const originalContent = await fileSystem.readContent("/home/Desktop/WELCOME.txt");
    expect(originalContent).toBeInstanceOf(Uint8Array);

    await fileSystem.writeFile(
      "/home/Desktop/WELCOME.txt",
      new TextEncoder().encode("updated from Notes"),
      "text/plain",
    );
    await expect(fileSystem.readContent("/home/Desktop/WELCOME.txt")).resolves.toEqual(
      new TextEncoder().encode("updated from Notes"),
    );
    await expect(fileSystem.readContent("/home/other.txt"))
      .rejects.toMatchObject({ code: "EACCES" });
  });

  it("opens registered links in a new tab without starting an app process", async () =>
  {
    const linkApp: AppManifest = {
      id: "test.link",
      name: "External Link",
      icon: "",
      link: new URL("https://example.com"),
      desktopPath: `${DESKTOP_DIRECTORY}/External.link`,
    };
    const kernel = new Kernel({ registry: new Map([[linkApp.id, linkApp]]) });
    await kernel.initialize();
    const open = vi.fn();
    vi.stubGlobal("window", { open });

    try
    {
      expect(await kernel.openPath(linkApp.desktopPath!)).toBeUndefined();
      expect(open).toHaveBeenCalledWith(
        linkApp.link.href,
        "_blank",
        "noopener,noreferrer",
      );
      expect(kernel.processManager.getProcesses()).toHaveLength(0);
      expect(kernel.windowManager.getWindows()).toHaveLength(0);
    }
    finally
    {
      vi.unstubAllGlobals();
    }
  });

  it("boots the VFS and launches/closes an app through the kernel", async () =>
  {
    const kernel = new Kernel({ registry: new Map([[testApp.id, testApp]]) });
    await kernel.initialize();

    const window = kernel.launchApp(testApp.id)!;
    expect(kernel.processManager.get(window.process.pid)).toBeDefined();

    expect(kernel.closeWindow(window.id)).toBe(true);
    expect(kernel.processManager.get(window.process.pid)).toBeUndefined();
  });

  it("lets an app close itself through its bridge", async () =>
  {
    const kernel = new Kernel({ registry: new Map([[testApp.id, testApp]]) });
    await kernel.initialize();

    const window = kernel.launchApp(testApp.id)!;
    window.process.bridge.close();

    expect(kernel.processManager.get(window.process.pid)).toBeUndefined();
    expect(kernel.windowManager.getWindows()).toHaveLength(0);
  });

  it("rejects attempts to launch an unregistered app", () =>
  {
    const processes = makeProcessManager();
    expect(() => processes.start("missing.app")).toThrow(ProcessManagerError);
  });
});
