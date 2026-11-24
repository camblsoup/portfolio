import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { createEffect, createSignal, onCleanup, onMount, Show, untrack } from "solid-js";
import "@milkdown/crepe/theme/common/style.css";

import type { AppComponentProps } from "../kernel/app-registry/structure.ts";

const isMarkdownFile = (path: string | undefined) => path?.toLowerCase().endsWith(".md") ?? false;

export function NotesApp({ bridge }: AppComponentProps)
{
  const [contents, setContents] = createSignal("");
  const [filePath, setFilePath] = createSignal<string | undefined>(bridge.openedFile);
  const [loading, setLoading] = createSignal(false);
  const [ready, setReady] = createSignal(false);
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

  const destroyEditor = () =>
  {
    const task = editorTask.catch(() => undefined).then(async () =>
    {
      const previousEditor = editor;
      editor = undefined;
      await previousEditor?.destroy();
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
  };

  createEffect((previousMarkdownMode: boolean | undefined) =>
  {
    const isReady = ready();
    const markdownMode = isMarkdownFile(filePath());
    if (!isReady)
    {
      return previousMarkdownMode;
    }

    if (markdownMode && previousMarkdownMode !== true)
    {
      void replaceEditorContent(untrack(contents)).catch((error: unknown) =>
      {
        console.error("Unable to initialize the Markdown editor.", error);
      });
    }
    else if (!markdownMode && previousMarkdownMode === true)
    {
      void destroyEditor().catch((error: unknown) =>
      {
        console.error("Unable to close the Markdown editor.", error);
      });
    }

    return markdownMode;
  });

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
      setReady(true);
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
          setReady(true);
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
    <Show
      when={isMarkdownFile(filePath())}
      fallback={
        <textarea
          class="notes-editor notes-plain-editor"
          aria-label="Text file contents"
          value={contents()}
          disabled={loading()}
          onInput={(event) => setContents(event.currentTarget.value)}
        />
      }
    >
      <div
        class="notes-editor"
        aria-label="Markdown note contents"
        aria-busy={loading()}
        ref={(element) => editorRoot = element}
      />
    </Show>
  );
}
