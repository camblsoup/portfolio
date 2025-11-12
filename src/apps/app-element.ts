import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("app-element")
export class AppElement extends LitElement 
{
    protected createRenderRoot(): HTMLElement | DocumentFragment 
    {
        return this;
    }
}
