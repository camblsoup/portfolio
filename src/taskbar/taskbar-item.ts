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
                <img src=${this.appInfo.icon} />
                ${this.appInfo.name}
            </div>
        `;
    }

    static styles?: CSSResultGroup | undefined = css`
        .taskbar-container {
            max-width: 120px;
            width: 100%;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        "taskbar-item": TaskbarItem;
    }
}
