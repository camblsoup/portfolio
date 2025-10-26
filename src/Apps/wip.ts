import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("wip-app")
export class WIP extends LitElement 
{
    render() 
    {
        return html`
			<p style="padding: 2px;">
				Sorry this site isn't quite finished. This is just the start so please do check in again in the future. 
				<br/>
				<br/> 
				For now feel free to play around with this window :D
			</p>
		`;
    }

    protected createRenderRoot(): HTMLElement | DocumentFragment 
    {
        return this;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'wip-app': WIP
    }
}