import { customElement, property, state } from "lit/decorators.js";
import { AppElement } from "./app-element";
import { NoteStore, type NoteData } from "../stores/note-store";
import { html } from "lit";
import "../components/dropdown";

@customElement("note-app")
export class Note extends AppElement 
{
    @property() private noteId: string = "wip";
    @state() private noteStore: NoteStore = NoteStore.getInstance();
    @state() note: NoteData = this.noteStore.getNote(this.noteId) ?? {
        id: crypto.randomUUID(),
        lastEdited: new Date(),
        content: "",
    };

    private saveNote() 
    {
        this.note.lastEdited = new Date();
        this.noteStore.saveNote(this.note);
    }

    private handleInput(e: InputEvent) 
    {
        this.note.content = (e.target as HTMLTextAreaElement).value;
    }

    protected render(): unknown 
    {
        return html`
            <div style="width: 100%; height: 100%;">
                <div style="display: flex; flex-direction: row;">
                    <dropdown-element
                        label="File"
                        .actions=${[{ label: "Save", action: this.saveNote }]}
                        .isOpen=${false}
                    ></dropdown-element>
                </div>
                <textarea
                    .value=${this.note.content}
                    @input=${this.handleInput}
                    style="all: unset; width: 100%; height: 100%;"
                ></textarea>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "note-app": Note;
    }
}
