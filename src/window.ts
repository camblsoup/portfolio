import { css, html, LitElement, type CSSResultGroup } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { applist } from "./apps-t/applist";

@customElement("window-element")
export class Window extends LitElement 
{
    @property({ type: String, reflect: true }) windowId!: string;
    @property({ type: Number, reflect: true }) appId: number | undefined;
    @property({ type: Number, reflect: true }) zIndex!: number;
    @property({ type: Number, reflect: true }) width: number = 250;
    @property({ type: Number, reflect: true }) height: number = 250;

    @state() private x = window.innerWidth / 2 - 250 / 2;
    @state() private y = window.innerHeight / 2 - 250 / 2 - 36;

    private isDragging: boolean = false;
    private offsetX: number = 0;
    private offsetY: number = 0;

    connectedCallback(): void 
    {
        super.connectedCallback();

        if (!this.windowId || typeof this.zIndex !== "number")
            throw new Error("Invalid props");

        window.addEventListener("return-to-view", this.handleReturnToView);
        window.addEventListener("close-window", this.handleCloseWindow);
    }

    disconnectedCallback(): void 
    {
        super.disconnectedCallback();
        window.removeEventListener("return-to-view", this.handleReturnToView);
        window.removeEventListener("close-window", this.handleCloseWindow);
    }

    private initMoveWindow(event: MouseEvent) 
    {
        this.isDragging = true;
        this.offsetX = event.clientX - this.x;
        this.offsetY = event.clientY - this.y;

        window.addEventListener("mouseup", this.cleanupMoveWindow);
        window.addEventListener("mousemove", this.moveWindow);
    }

    private cleanupMoveWindow = () => 
    {
        this.isDragging = false;

        window.removeEventListener("mouseup", this.cleanupMoveWindow);
        window.removeEventListener("mousemove", this.moveWindow);
    };

    private moveWindow = (event: MouseEvent) => 
    {
        if (!this.isDragging) return;

        this.x = Math.max(
            0,
            Math.min(
                event.clientX - this.offsetX,
                window.innerWidth - this.width,
            ),
        );
        this.y = Math.max(
            0,
            Math.min(
                event.clientY - this.offsetY,
                window.innerHeight - 20 - 36,
            ),
        );
    };

    private initResizeWindow(event: MouseEvent) 
    {
        this.isDragging = true;
        this.offsetX = event.clientX - this.width - this.x;
        this.offsetY = event.clientY - this.height - this.y;

        window.addEventListener("mouseup", this.cleanupResizeWindow);
        window.addEventListener("mousemove", this.resizeWindow);
    }

    private cleanupResizeWindow = () => 
    {
        this.isDragging = false;

        window.removeEventListener("mouseup", this.cleanupResizeWindow);
        window.removeEventListener("mousemove", this.resizeWindow);
    };

    private resizeWindow = (event: MouseEvent) => 
    {
        if (!this.isDragging) return;

        this.width = Math.max(
            0,
            Math.min(
                event.clientX - this.x - this.offsetX,
                window.innerWidth - this.x,
            ),
        );
        this.height = Math.max(
            0,
            Math.min(
                event.clientY - this.y - this.offsetY,
                window.innerHeight - this.y - 36,
            ),
        );
    };

    private handleReturnToView(event: Event) 
    {
        const detail = (event as CustomEvent<{ windowId?: string }>).detail;
        if (detail?.windowId === this.windowId) this.returnToView();
    }

    private returnToView() 
    {
        this.x = Math.max(0, Math.min(this.x, window.innerWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, window.innerHeight - 20 - 36));
    }

    private handleCloseWindow(event: Event) 
    {
        const detail = (event as CustomEvent<{ windowId?: string }>).detail;
        if (detail?.windowId === this.windowId) this.closeWindow();
    }

    private closeWindow() 
    {
        this.remove();
    }

    private focusWindow = () => 
    {
        this.dispatchEvent(
            new CustomEvent("focus-window", { bubbles: true, composed: true }),
        );
    };

    private renderApp() 
    {
        const appInfo = applist[this.appId ?? 0];
        this.width = appInfo.width ?? this.width;
        this.height = appInfo.height ?? this.height;
        this.x = appInfo.x ?? this.x;
        this.y = appInfo.y ?? this.y;

        const appElement = customElements.get(`${appInfo.name ?? "wip"}-app`);
        return appElement
            ? html`${new appElement()}`
            : html`<p style="padding: 2px;">App not found</p>`;
    }

    render() 
    {
        return html`
            <div
                class="window"
                style="--x: ${this.x}px; --y: ${this.y}px; --width: ${this
    .width}px; --height: ${this.height}px; --z-index: ${this
    .zIndex};"
                @pointerdown=${this.focusWindow}
            >
                <div class="top-bar" @mousedown=${this.initMoveWindow}>
                    <div class="title"></div>
                    <div class="controls">
                        <button class="close" @click=${this.closeWindow}>
                            <img />
                        </button>
                    </div>
                </div>
                <div class="content">${this.renderApp()}</div>
                <div class="bottom-bar">
                    <div class="info"></div>
                    <div
                        class="resize-window"
                        @mousedown=${this.initResizeWindow}
                    ></div>
                </div>
            </div>
        `;
    }

    static styles?: CSSResultGroup | undefined = css`
        .window {
            position: absolute;
            display: flex;
            flex-direction: column;
            top: var(--y, 0px);
            left: var(--x, 0px);
            width: var(--width, 250px);
            height: var(--height, 250px);
            min-width: 100px;
            min-height: 100px;
            border: 1px solid black;
            z-index: var(--z-index, 0);
            background-color: #fffeaa;
        }
        .top-bar {
            box-sizing: border-box;
            display: flex;
            flex-direction: row;
            width: 100%;
            height: 20px;
            border-bottom: 1px solid black;
            user-select: none;
            padding: 2px;
        }
        .top-bar .title {
            flex-grow: 1;
            height: 100%;
        }
        .content {
            width: 100%;
            flex-grow: 1;
            overflow: auto;
        }
        .bottom-bar {
            display: flex;
            flex-direction: row;
            width: 100%;
            height: 10px;
            border-top: 1px solid black;
            user-select: none;
        }
        .bottom-bar .info {
            flex-grow: 1;
        }
        .bottom-bar .resize-window {
            cursor: nw-resize;
            width: 10px;
            height: 10px;
            border-left: 1px solid black;
            background: linear-gradient(
                to top left,
                black,
                black 1px,
                transparent 1px,
                transparent 3px,
                black 3px,
                black 4px,
                transparent 4px,
                transparent 6px,
                black 6px,
                black 7px,
                transparent 7px
            );
        }
        button {
            background: none;
            border: 1px solid black;
            width: 18px;
            height: 100%;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        "window-element": Window;
    }
}
