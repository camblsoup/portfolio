import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("app-element")
export class App extends LitElement 
{
    protected createRenderRoot(): HTMLElement | DocumentFragment 
    {
        return this;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "app-element": App;
    }
}
