import { FileManagerApp } from "../../apps/file-manager-app.tsx";
import { NotesApp } from "../../apps/notes-app.tsx";
import { PaintApp } from "../../apps/paint-app.tsx";
import type { AppManifest } from "./structure.ts";

export const appArr: AppManifest[] = [
  {
    id: "apps.notes-app.camblsoup",
    name: "Notes",
    icon: "/file-icons/notes.svg",
    binaryPath: "/system/apps/notes.app",
    desktopPath: "/home/Desktop/Notes.app",
    fileAssociations: [
      { mimeType: "text/plain", actions: ["read", "write"] },
      { mimeType: "text/markdown", actions: ["read", "write"] },
    ],
    defaultWindowConfig: {
      width: 480,
      height: 300,
      minWidth: 320,
      minHeight: 220,
    },

    component: NotesApp,
  },
  {
    id: "apps.file-manager.camblsoup",
    name: "Files",
    icon: "/file-icons/folder.svg",
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
  {
    id: "apps.paint.camblsoup",
    name: "Paint",
    icon: "/file-icons/paint.svg",
    binaryPath: "/system/apps/paint.app",
    desktopPath: "/home/Desktop/Paint.app",
    directoryHandler: true,
    defaultWindowConfig: {
      width: 640,
      height: 400,
      minWidth: 360,
      minHeight: 240,
    },
    component: PaintApp,
  },
  {
    id: "links.github.camblsoup",
    name: "Github",
    icon: "/file-icons/github.svg",
    link: new URL("https://github.com/camblsoup"),
    desktopPath: "/home/Desktop/Github.link",
  },
  {
    id: "links.linkedin.camblsoup",
    name: "LinkedIn",
    icon: "/file-icons/linkedin.svg",
    link: new URL("https://www.linkedin.com/in/cameronmclagan/"),
    desktopPath: "/home/Desktop/LinkedIn.link",
  },
];

export const appRegistry: Map<string, AppManifest> = new Map(
  appArr.map((
    p,
  ) => [p.id, p]),
);
