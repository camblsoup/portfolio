import { css, html, LitElement, type CSSResultGroup } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { appInfo } from "../apps/applist";
import { applist } from "../apps/applist";

@customElement("taskbar-item")
export class TaskbarItem extends LitElement 
{
    @property({ type: Number, reflect: true }) appId: number = 0;

    private get appInfo(): appInfo 
    {
        return applist.at(this.appId) ?? applist.at(0)!;
    }

    protected render(): unknown 
    {
        return html`
            <div class="taskbar-container">
                <img class="app-icon" src=${this.appInfo.icon} />
                ${this.appInfo.name}
            </div>
        `;
    }

    static styles?: CSSResultGroup | undefined = css`
        .taskbar-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            height: 100%;
            gap: 2px;
        }

        .app-icon {
            width: 24px;
            height: 24px;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        "taskbar-item": TaskbarItem;
    }
}
