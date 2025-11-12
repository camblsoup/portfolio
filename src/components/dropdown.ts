import { html, LitElement } from "lit";
import { property } from "lit/decorators.js";

export class Dropdown extends LitElement 
{
    @property({ type: String, reflect: true }) private label = "";
    @property({ type: Array }) private actions: Array<{
        label: string;
        function: () => void;
    }> = [];
    @property({ type: Boolean, reflect: true }) private isOpen = false;

    protected render(): unknown 
    {
        if (!this.isOpen) 
        {
            return html` <div class="dropdown-closed">${this.label}</div> `;
        }
        return html`
            <div class="dropdown-open">
                ${this.actions.map(
        (action) => html`
                        <button @click=${action.function}>
                            ${action.label}
                        </button>
                    `,
    )}
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
        "dropdown-element": Dropdown;
    }
}
