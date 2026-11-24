import type { Component } from "solid-js";
import type { FileSystemAction } from "../process-context.ts";
import type { ProcessFileSystem } from "../vfs/vfs.ts";

export interface ChromeMenuItem
{
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface ChromeMenuCategory
{
  label: string;
  items: ChromeMenuItem[];
}

export interface SaveDialogBridge
{
  suggestedName: string;
  select: (path: string) => void;
  cancel: () => void;
}

export interface AppBridge
{
  pid: number;
  fileSystem: ProcessFileSystem;
  openedFile?: string;
  openedDirectory?: string;
  saveDialog?: SaveDialogBridge;
  openPath: (path: string) => Promise<void>;
  chooseSavePath: (suggestedName: string) => Promise<string | undefined>;
  setMenus: (menus: ChromeMenuCategory[]) => void;
  setContextMenu: (items: ChromeMenuItem[]) => void;
}

export interface AppComponentProps
{
  bridge: AppBridge;
}

export interface FileAssociation
{
  mimeType: string;
  actions: readonly FileSystemAction[];
  icon?: string;
}

export interface AppManifest
{
  id: string;
  name: string;
  icon: string;
  link?: URL;
  binaryPath?: string;
  desktopPath?: string;
  directoryHandler?: boolean;
  fileAssociations?: readonly FileAssociation[];

  defaultWindowConfig?: {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
  };

  constraints?: {
    singleton?: boolean;
  };

  component?: Component<AppComponentProps>;
}
