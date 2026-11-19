import { createEffect, createSignal, onMount } from "solid-js";
import type { AppComponentProps } from "../kernel/app-registry/structure.ts";

export function NotesApp({ bridge }: AppComponentProps)
{
  const [contents, setContents] = createSignal("");
  const [filePath, setFilePath] = createSignal<string | undefined>(bridge.openedFile);
  const [loading, setLoading] = createSignal(false);

  const writeFile = async (path: string) =>
  {
    await bridge.fileSystem.writeFile(
      path,
      new TextEncoder().encode(contents()),
      "text/plain",
    );
  };

  const save = async () =>
  {
    const currentPath = filePath();
    if (!currentPath)
    {
      return;
    }

    try
    {
      await writeFile(currentPath);
    }
    catch (error)
    {
      console.error(`Unable to save '${currentPath}'.`, error);
    }
  };

  const saveAs = async () =>
  {
    try
    {
      const selectedPath = await bridge.chooseSavePath("Untitled.txt");
      if (!selectedPath)
      {
        return;
      }

      setFilePath(selectedPath);
      await writeFile(selectedPath);
    }
    catch (error)
    {
      console.error("Unable to save the new note.", error);
    }
  };

  const newNote = () =>
  {
    setFilePath(undefined);
    setContents("");
  };

  createEffect(() =>
  {
    const currentPath = filePath();
    const isLoading = loading();
    bridge.setMenus([{
      label: "File",
      items: [
        {
          label: "New",
          disabled: isLoading,
          onClick: newNote,
        },
        {
          label: "Save",
          disabled: !currentPath,
          onClick: () => void save(),
        },
        {
          label: "Save As…",
          disabled: isLoading,
          onClick: () => void saveAs(),
        },
      ],
    }]);
  });

  onMount(() =>
  {
    const initialPath = bridge.openedFile;
    if (!initialPath)
    {
      return;
    }

    setLoading(true);
    void bridge.fileSystem.readContent(initialPath).then((bytes) =>
    {
      setContents(new TextDecoder().decode(bytes));
    }).catch((error: unknown) =>
    {
      console.error(`Unable to open '${initialPath}'.`, error);
    }).finally(() =>
    {
      setLoading(false);
    });
  });

  return (
    <textarea
      class="notes-editor"
      aria-label="Text file contents"
      value={contents()}
      disabled={loading()}
      onInput={(event) => setContents(event.currentTarget.value)}
    />
  );
}
