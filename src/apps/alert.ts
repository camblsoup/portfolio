import { customElement, property } from "lit/decorators.js";
import { AppElement } from "./app-element";
import { html } from "lit";

const Severity = {
    INFO: 0,
    WARNING: 1,
    ERROR: 2,
} as const;
type Severity = (typeof Severity)[keyof typeof Severity];

@customElement("alert-app")
export class Alert extends AppElement 
{
    @property({ attribute: false }) private severity: Severity = Severity.INFO;
    @property({ type: String, reflect: true }) private message: string = "";

    private alertIcon(): string 
    {
        switch (this.severity) 
        {
        case Severity.INFO:
            return "info.webp";
        case Severity.WARNING:
            return "warning.webp";
        case Severity.ERROR:
            return "error.webp";
        }
    }

    protected render(): unknown 
    {
        return html`
            <div>
                <img
                    src="https://camblsoup.github.io/portfolio/assets/alert-icons/${this.alertIcon()}"
                />
                <p>${this.message}</p>
            </div>
        `;
    }
}
