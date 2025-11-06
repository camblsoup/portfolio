import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./taskbar-item";

@customElement("taskbar-element")
export class Taskbar extends LitElement 
{
    @state() private currentTime = new Date().toLocaleTimeString("en-CA", {
        hour: "2-digit",
        minute: "2-digit",
    });
    @state() private pinnedApps: number[] = [];
    @state() private openApps: number[] = [];

    private intervalId: number | undefined;

    connectedCallback(): void 
    {
        super.connectedCallback();

        const pinnedApps = localStorage.getItem("pinned-apps");

        console.log(pinnedApps);

        if (pinnedApps) 
        {
            const state = JSON.parse(pinnedApps);
            this.pinnedApps = state;
        }

        this.intervalId = window.setInterval(() => 
        {
            this.currentTime = new Date().toLocaleTimeString("en-CA", {
                hour: "2-digit",
                minute: "2-digit",
            });
        }, 60000);
    }

    disconnectedCallback(): void 
    {
        super.disconnectedCallback();

        if (this.intervalId) 
        {
            clearInterval(this.intervalId);
        }
    }

    private pinApp(appId: number) 
    {
        if (this.pinnedApps.includes(appId)) return;
        this.pinnedApps = [...this.pinnedApps, appId];
        localStorage.setItem(
            "pinned-apps",
            JSON.stringify([...this.pinnedApps]),
        );
    }

    private unPinApp(appId: number) 
    {
        this.pinnedApps = [
            ...this.pinnedApps.filter((storedId) => storedId !== appId),
        ];
        localStorage.setItem(
            "pinned-apps",
            JSON.stringify([...this.pinnedApps]),
        );
    }

    render() 
    {
        return html`
            <div class="taskbar">
                <div class="home">
                    <p>home</p>
                </div>
                <div class="content">
                    ${this.pinnedApps.map(
        (appId) => html`
                            <taskbar-item .appId=${appId}></taskbar-item>
                        `,
    )}
                </div>
                <div class="info">
                    <p>${this.currentTime}</p>
                </div>
            </div>
        `;
    }

    protected createRenderRoot(): HTMLElement | DocumentFragment 
    {
        return this;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "taskbar-element": Taskbar;
    }
}
