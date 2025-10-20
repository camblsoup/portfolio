import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("desktop-element")
export class Desktop extends LitElement {

    render() {
        return html`
            <div>
                <p>WIP :D</p>
            </div>
        `
    }
}


declare global {
    interface HTMLElementTagNameMap {
        'desktop-element': Desktop
    }
}
