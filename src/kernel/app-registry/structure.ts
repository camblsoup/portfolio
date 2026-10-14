import { Component } from "solid-js";

/** Defines the menu item exposed by an application. */
export interface ChromeMenuItem {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/** Groups application menu items under a category label. */
export interface ChromeMenuCategory {
  label: string;
  items: ChromeMenuItem[];
}

/** Provides the application with its process identity and menu registration hook. */
export interface AppBridge {
  pid: number;
  setMenus: (menus: ChromeMenuCategory[]) => void;
}

/** Describes an application available to the desktop environment. */
export interface AppManifest {
  id: string;
  name: string;
  icon: string; // Should be a path to some image living in a defined folder, come up with this later idk

  defaultWindowConfig: {
    width: number;
    height: number;
    minWidth?: number;
    minHeight?: number;
  };

  constraints?: {
    singleton?: boolean;
  };

  component: Component;
}
