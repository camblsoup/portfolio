import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("taskbar-element")
export class Taskbar extends LitElement 
{
    @state() private currentTime = new Date().toLocaleTimeString("en-CA", {hour: "2-digit", minute: "2-digit"});

    private intervalId: number | undefined;

    connectedCallback(): void 
    {
        super.connectedCallback();

        this.intervalId = window.setInterval(() => 
        {
            this.currentTime = new Date().toLocaleTimeString("en-CA", {hour: "2-digit", minute: "2-digit"});
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

    render() 
    {
        return html`
        <div class="taskbar">
            <div class="home">
                <p>home</p>
            </div>
            <div class="content">
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
        'taskbar-element': Taskbar
    }
}
