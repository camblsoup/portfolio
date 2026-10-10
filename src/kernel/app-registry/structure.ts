import { Component } from "solid-js";

export interface ChromeMenuItem {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface ChromeMenuCategory {
  label: string;
  items: ChromeMenuItem[];
}

export interface AppBridge {
  pid: number;
  setMenus: (menus: ChromeMenuCategory[]) => void;
}

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
