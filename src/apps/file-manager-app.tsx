import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { AppComponentProps, ChromeMenuItem } from "../kernel/app-registry/structure.ts";
import { defaultNodeIcon } from "../components/default-node-icon.ts";
import type { VFSNode } from "../kernel/vfs/structure.ts";
import { VFSNodeType } from "../kernel/vfs/structure.ts";

const VFS_PATH_DRAG_TYPE = "application/x-myos-vfs-path";

interface FolderTreeNodeProps {
  bridge: AppComponentProps["bridge"];
  path: string;
  currentPath: string;
  onSelect: (path: string) => void;
  onError: (message: string) => void;
}

function FolderTreeNode(props: FolderTreeNodeProps) {
  const [expanded, setExpanded] = createSignal(false);
  const [folders, setFolders] = createSignal<VFSNode[]>([]);

  const loadFolders = async () => {
    try {
      const entries = await props.bridge.fileSystem.listDirectory(props.path);
      setFolders(entries.filter((entry) => entry.nodeType === VFSNodeType.DIRECTORY));
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Unable to read folders");
    }
  };

  const isCurrentBranch = () => {
    const prefix = props.path === "/" ? "/" : `${props.path}/`;
    return props.currentPath === props.path || props.currentPath.startsWith(prefix);
  };

  createEffect(() => {
    if (isCurrentBranch() && !expanded()) {
      setExpanded(true);
      void loadFolders();
    }
  });

  const toggle = () => {
    const nextExpanded = !expanded();
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFolders();
  };

  return (
    <div class="folder-tree-node">
      <div classList={{ "folder-tree-row": true, selected: props.currentPath === props.path }}>
        <button class="folder-tree-toggle" type="button" onClick={toggle}>
          {expanded() ? "−" : "+"}
        </button>
        <button class="folder-tree-name" type="button" onClick={() => props.onSelect(props.path)}>
          <img
            class="folder-tree-icon"
            src={expanded() ? "/file-icons/folder-open.svg" : "/file-icons/folder.svg"}
            alt=""
          />
          {props.path === "/" ? "/" : props.path.slice(props.path.lastIndexOf("/") + 1)}
        </button>
      </div>
      <Show when={expanded()}>
        <div class="folder-tree-children">
          <For each={folders()}>
            {(folder) => (
              <FolderTreeNode
                bridge={props.bridge}
                path={props.path === "/" ? `/${folder.name}` : `${props.path}/${folder.name}`}
                currentPath={props.currentPath}
                onSelect={props.onSelect}
                onError={props.onError}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function isWritablePath(path: string): boolean {
  return path === "/home" || path.startsWith("/home/") || path === "/tmp" ||
    path.startsWith("/tmp/");
}

export function FileManagerApp({ bridge }: AppComponentProps) {
  const rootPath = bridge.openedDirectory ?? "/";
  const saveDialog = bridge.saveDialog;
  const [path, setPath] = createSignal(rootPath);
  const [fileName, setFileName] = createSignal(saveDialog?.suggestedName ?? "");
  const [entries, setEntries] = createSignal<VFSNode[]>([]);
  const [refreshVersion, setRefreshVersion] = createSignal(0);
  const [error, setError] = createSignal("");

  createEffect(() => {
    const currentPath = path();
    refreshVersion();
    let cancelled = false;
    setError("");

    void bridge.fileSystem.listDirectory(currentPath).then((nodes) => {
      if (!cancelled) setEntries([...nodes]);
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : "Unable to read directory");
      }
    });

    onCleanup(() => {
      cancelled = true;
    });
  });

  const childPath = (name: string) => path() === "/" ? `/${name}` : `${path()}/${name}`;
  const navigateUp = () => {
    const currentPath = path();
    if (currentPath === "/") return;
    setPath(currentPath.slice(0, currentPath.lastIndexOf("/")) || "/");
  };

  const openEntry = (entry: VFSNode) => {
    const targetPath = childPath(entry.name);
    if (entry.nodeType === VFSNodeType.DIRECTORY) {
      setPath(targetPath);
    } else if (saveDialog) {
      setFileName(entry.name);
    } else {
      void bridge.openPath(targetPath).catch((reason: unknown) => {
        console.error(`Unable to open '${targetPath}'.`, reason);
      });
    }
  };

  const createFolder = async () => {
    const name = globalThis.prompt("Folder name")?.trim();
    if (!name || name.includes("/")) return;
    try {
      await bridge.fileSystem.createDirectory(childPath(name));
      setRefreshVersion((version) => version + 1);
    } catch (reason) {
      console.error("Unable to create folder.", reason);
    }
  };

  const createTextFile = async () => {
    const name = globalThis.prompt("File name", "Untitled.txt")?.trim();
    if (!name || name.includes("/") || entries().some((entry) => entry.name === name)) return;
    try {
      await bridge.fileSystem.writeFile(childPath(name), new Uint8Array(), "text/plain");
      setRefreshVersion((version) => version + 1);
    } catch (reason) {
      console.error("Unable to create file.", reason);
    }
  };

  const deleteEntry = async (entry: VFSNode) => {
    const targetPath = childPath(entry.name);
    if (!isWritablePath(path()) || !globalThis.confirm(`Delete '${entry.name}'?`)) return;
    try {
      await bridge.fileSystem.delete(targetPath);
      setRefreshVersion((version) => version + 1);
    } catch (reason) {
      console.error(`Unable to delete '${targetPath}'.`, reason);
    }
  };

  const setContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-vfs-path]")
      : null;
    const targetPath = target?.dataset.vfsPath;
    const entry = entries().find((candidate) => childPath(candidate.name) === targetPath);
    const writable = isWritablePath(path());
    const items: ChromeMenuItem[] = [];

    if (entry) {
      items.push({ label: "Open", onClick: () => openEntry(entry) });
      if (!saveDialog) {
        items.push({
          label: "Delete",
          disabled: !writable,
          onClick: () => void deleteEntry(entry),
        });
      }
    }
    items.push({
      label: "New Folder",
      disabled: !writable,
      onClick: () => void createFolder(),
    });
    if (!saveDialog) {
      items.push({
        label: "New Text File",
        disabled: !writable,
        onClick: () => void createTextFile(),
      });
    }
    bridge.setContextMenu(items);
  };

  const selectSavePath = () => {
    const name = fileName().trim();
    if (!saveDialog || !name) return;
    saveDialog.select(childPath(name));
  };

  const canAcceptDrop = (event: DragEvent) =>
    !saveDialog && Array.from(event.dataTransfer?.types ?? []).includes(VFS_PATH_DRAG_TYPE);

  const allowDrop = (event: DragEvent) => {
    if (!canAcceptDrop(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  const moveDroppedItem = (event: DragEvent, destinationDirectory: string) => {
    if (!canAcceptDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const sourcePath = event.dataTransfer?.getData(VFS_PATH_DRAG_TYPE);
    if (!sourcePath) return;
    const sourceParent = sourcePath.slice(0, sourcePath.lastIndexOf("/")) || "/";
    if (!isWritablePath(sourceParent) || !isWritablePath(destinationDirectory)) return;

    const draggedName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
    const destinationPath = destinationDirectory === "/"
      ? `/${draggedName}`
      : `${destinationDirectory}/${draggedName}`;
    if (destinationPath === sourcePath) return;

    void bridge.fileSystem.move(sourcePath, destinationPath).then(() => {
      setRefreshVersion((version) => version + 1);
    }).catch((reason: unknown) => {
      console.error(`Unable to move '${sourcePath}' to '${destinationPath}'.`, reason);
    });
  };

  return (
    <section class="file-manager" onContextMenu={setContextMenu}>
      <div class="file-manager-toolbar">
        <button type="button" onClick={navigateUp} disabled={path() === "/"}>Up</button>
        <code>{path()}</code>
      </div>
      <div class="file-manager-main">
        <nav class="folder-tree" aria-label="Folders">
          <FolderTreeNode
            bridge={bridge}
            path="/"
            currentPath={path()}
            onSelect={setPath}
            onError={setError}
          />
        </nav>
        <div
          class="file-manager-list"
          onDragOver={allowDrop}
          onDrop={(event) => moveDroppedItem(event, path())}
        >
          <For each={entries()}>
            {(entry) => (
              <button
                class="file-manager-entry"
                type="button"
                data-vfs-path={childPath(entry.name)}
                draggable={!saveDialog && isWritablePath(path())}
                onDragStart={(event) => {
                  if (!event.dataTransfer) return;
                  event.dataTransfer.setData(VFS_PATH_DRAG_TYPE, childPath(entry.name));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={entry.nodeType === VFSNodeType.DIRECTORY ? allowDrop : undefined}
                onDrop={(event) => {
                  if (entry.nodeType === VFSNodeType.DIRECTORY) {
                    moveDroppedItem(event, childPath(entry.name));
                  } else {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                onDblClick={() => openEntry(entry)}
              >
                <span class="file-manager-entry-name">
                  <img src={defaultNodeIcon(entry)} alt="" />
                  {entry.name}
                </span>
                <small>
                  {entry.nodeType === VFSNodeType.DIRECTORY ? "Directory" : entry.mimeType}
                </small>
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={saveDialog}>
        <div class="file-manager-save">
          <label>
            File name
            <input
              value={fileName()}
              onInput={(event) => setFileName(event.currentTarget.value)}
            />
          </label>
          <button type="button" disabled={!fileName().trim()} onClick={selectSavePath}>Save</button>
          <button type="button" onClick={() => saveDialog?.cancel()}>Cancel</button>
        </div>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </section>
  );
}
