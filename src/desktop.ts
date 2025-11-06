import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./taskbar/taskbar";
import "./window";

@customElement("desktop-element")
export class Desktop extends LitElement 
{
    @state() private openApps: Map<string, number> = new Map();
    @state() private windowStack: string[] = [];

    connectedCallback(): void 
    {
        super.connectedCallback();
        this.openApp(0);
        this.openApp(0);

        localStorage.setItem("pinned-apps", JSON.stringify([0]));

        window.addEventListener("open-app", this.handlOpenApp);
    }

    private handlOpenApp(event: Event) 
    {
        const detail = (event as CustomEvent<{ appId: number }>).detail;
        this.openApp(detail.appId);
    }

    private openApp(appId: number) 
    {
        const uid = crypto.randomUUID();
        this.openApps.set(uid, appId);
        this.windowStack = [...this.windowStack, uid];
    }

    private focusWindow(windowId: string) 
    {
        this.windowStack = [
            ...this.windowStack.filter((id) => id !== windowId),
            windowId,
        ];
    }

    render() 
    {
        return html`
            <div class="desktop">
                <taskbar-element></taskbar-element>
                ${Array.from(this.openApps).map(([windowId, appId]) => 
    {
        const zIndex = this.windowStack.indexOf(windowId) + 1;
        return html`
                        <window-element
                            .windowId=${windowId}
                            .appId=${appId}
                            .zIndex=${zIndex}
                            @focus-window=${() => this.focusWindow(windowId)}
                        ></window-element>
                    `;
    })}
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
        "desktop-element": Desktop;
    }
}
