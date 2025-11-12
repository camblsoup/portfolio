import "./wip";
import "./note";

export interface appInfo {
    icon: string;
    name: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}

const iconFolder = "https://camblsoup.github.io/portfolio/assets/app-icons/";

export const applist: Array<appInfo> = [
    {
        name: "wip",
        icon: iconFolder + "notes.svg",
    },
    {
        name: "note",
        icon: iconFolder + "notes.svg",
    },
];
