import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./taskbar";
import "./window";

@customElement("desktop-element")
export class Desktop extends LitElement 
{
    render() 
    {
        return html`
            <div class="desktop">
                <window-element appId=0></window-element>
                <taskbar-element></taskbar-element>
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
        'desktop-element': Desktop
    }
}
