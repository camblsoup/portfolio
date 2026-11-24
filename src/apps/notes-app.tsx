import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import "@milkdown/crepe/theme/common/style.css";

import type { AppComponentProps } from "../kernel/app-registry/structure.ts";

export function NotesApp({ bridge }: AppComponentProps)
{
  const [contents, setContents] = createSignal("");
  const [filePath, setFilePath] = createSignal<string | undefined>(bridge.openedFile);
  const [loading, setLoading] = createSignal(false);
  let editorRoot: HTMLDivElement | undefined;
  let editor: Crepe | undefined;
  let editorTask = Promise.resolve();
  let disposed = false;

  const replaceEditorContent = (markdown: string) =>
  {
    const task = editorTask.catch(() => undefined).then(async () =>
    {
      const previousEditor = editor;
      editor = undefined;
      await previousEditor?.destroy();
      if (disposed || !editorRoot)
      {
        return;
      }

      const nextEditor = new Crepe({
        root: editorRoot,
        defaultValue: markdown,
        features: {
          [CrepeFeature.Toolbar]: false,
          [CrepeFeature.BlockEdit]: false,
          [CrepeFeature.TopBar]: false,
          [CrepeFeature.Cursor]: false,
          [CrepeFeature.LinkTooltip]: false,
          [CrepeFeature.Placeholder]: false,
        },
      });
      nextEditor.on((listener) =>
      {
        listener.markdownUpdated((_context, updatedMarkdown) =>
        {
          if (!disposed && editor === nextEditor)
          {
            setContents(updatedMarkdown);
          }
        });
      });
      editor = nextEditor;
      await nextEditor.create();
    });
    editorTask = task;
    return task;
  };

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
    void replaceEditorContent("").catch((error: unknown) =>
    {
      console.error("Unable to reset the note editor.", error);
    });
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
      void replaceEditorContent("").catch((error: unknown) =>
      {
        console.error("Unable to initialize the note editor.", error);
      });
      return;
    }

    setLoading(true);
    void (async () =>
    {
      try
      {
        const bytes = await bridge.fileSystem.readContent(initialPath);
        if (!disposed)
        {
          setContents(new TextDecoder().decode(bytes));
        }
      }
      catch (error)
      {
        console.error(`Unable to open '${initialPath}'.`, error);
      }
      finally
      {
        if (!disposed)
        {
          try
          {
            await replaceEditorContent(contents());
          }
          catch (error)
          {
            console.error("Unable to initialize the note editor.", error);
          }
          setLoading(false);
        }
      }
    })();
  });

  onCleanup(() =>
  {
    disposed = true;

    void editorTask.catch(() => undefined).then(async () =>
    {
      await editor?.destroy();
      editor = undefined;
    });
  });

  return (
    <div
      class="notes-editor"
      aria-label="Markdown note contents"
      aria-busy={loading()}
      ref={(element) => editorRoot = element}
    />
  );
}
