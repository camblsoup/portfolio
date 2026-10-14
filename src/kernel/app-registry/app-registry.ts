import { WelcomeApp } from "../../apps/welcome-component.tsx";
import { AppManifest } from "./structure.ts";

/** Application manifests registered with the desktop environment. */
export const appArr: AppManifest[] = [
  {
    id: "default.welcome-app.camblsoup",
    name: "Welcome App",
    icon: "",
    defaultWindowConfig: {
      width: 100,
      height: 100,
    },
    component: WelcomeApp,
  },
];

/** Application manifests indexed by application ID. */
export const appRegistry: Map<string, AppManifest> = new Map(
  appArr.map((
    p,
  ) => [p.id, p]),
);
