import { FileManagerApp } from "../../apps/file-manager-app.tsx";
import { NotesApp } from "../../apps/notes-app.tsx";
import type { AppManifest } from "./structure.ts";

export const appArr: AppManifest[] = [
  {
    id: "default.notes-app.camblsoup",
    name: "Notes",
    icon: "",
    binaryPath: "/system/apps/notes.app",
    fileAssociations: [{ mimeType: "text/plain", actions: ["read", "write"] }],
    defaultWindowConfig: {
      width: 480,
      height: 300,
      minWidth: 320,
      minHeight: 220,
    },

    component: NotesApp,
  },
  {
    id: "default.file-manager.camblsoup",
    name: "Files",
    icon: "",
    binaryPath: "/system/apps/files.app",
    desktopPath: "/home/Desktop/Files.app",
    directoryHandler: true,
    defaultWindowConfig: {
      width: 560,
      height: 400,
      minWidth: 360,
      minHeight: 240,
    },
    component: FileManagerApp,
  },
];

export const appRegistry: Map<string, AppManifest> = new Map(
  appArr.map((
    p,
  ) => [p.id, p]),
);
