export interface NoteData {
    id: string;
    content: string;
    lastEdited: Date;
    version?: number;
}

export class NoteStore 
{
    private static instance: NoteStore;
    private notesMap = new Map<string, NoteData>();

    private constructor() 
    {
        this.loadFromLocalStorage();
        const existingWip = this.notesMap.get("wip");
        const starterNote = {
            id: "wip",
            lastEdited: new Date(1762911523 * 1000),
            content: `Hi my name is Cameron! I'm a Computer Science student currently studying at Simon Fraser University. This website is (hopefully) going to turn into my portfolio, unfortunately it isn't quite done yet... The end goal is a windows98 themed website with some basic features implemented along with custom apps to showcase some of my work, I'm a long ways away from that though.

If you would like to check in on my progress feel free to visit the repository where this site is hosted: https://github.com/camblsoup/portfolio

Otherwise feel free to play around with this window here, you can:
  - Move it around
  - Resize it
  - Close it
  - Edit this note`,
            version: 3,
        };
        if (existingWip && existingWip.version === starterNote.version) return;
        this.saveNote(starterNote);
    }

    static getInstance(): NoteStore 
    {
        if (!NoteStore.instance) 
        {
            NoteStore.instance = new NoteStore();
        }
        return NoteStore.instance;
    }

    private loadFromLocalStorage() 
    {
        try 
        {
            const notes = JSON.parse(localStorage.getItem("notes") ?? "[]");
            this.notesMap.clear();
            notes.forEach((note: NoteData) => 
            {
                note.lastEdited = new Date(note.lastEdited);
                this.notesMap.set(note.id, note);
            });
        }
        catch 
        {
            this.notesMap.clear();
        }
    }

    private updateLocalStorage() 
    {
        localStorage.setItem(
            "notes",
            JSON.stringify([...this.notesMap.values()]),
        );
    }

    saveNote(note: NoteData): boolean 
    {
        this.notesMap.set(note.id, note);
        if (this.notesMap.has(note.id)) this.updateLocalStorage();
        return this.notesMap.has(note.id);
    }

    getNote(id: string): NoteData | undefined 
    {
        return this.notesMap.get(id);
    }

    getAllNotes(): NoteData[] 
    {
        return [...this.notesMap.values()];
    }

    deleteNote(id: string): boolean 
    {
        const deleted = this.notesMap.delete(id);
        if (deleted) this.updateLocalStorage();
        return deleted;
    }
}
