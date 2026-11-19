import { createSignal, onMount, Show } from "solid-js";
import { Desktop } from "./components/desktop/desktop.tsx";
import { KernelProvider } from "./components/kernel-provider.tsx";
import { appRegistry } from "./kernel/app-registry/app-registry.ts";
import { Kernel } from "./kernel/kernel.ts";
import "./App.css";

function App()
{
  const [kernel, setKernel] = createSignal<Kernel>();

  onMount(() =>
  {
    const runtime = new Kernel({ registry: appRegistry });
    void runtime.initialize().then(() =>
    {
      setKernel(runtime);
    }).catch((error: unknown) =>
    {
      console.error("Kernel startup failed.", error);
    });
  });

  const openPath = (path: string) =>
  {
    const runtime = kernel();
    if (!runtime)
    {
      return;
    }

    void runtime.openPath(path).catch((error: unknown) =>
    {
      console.error(`Unable to open '${path}'.`, error);
    });
  };

  return (
    <Show when={kernel()} fallback={<main class="desktop" />}>
      {(runtime) => (
        <KernelProvider kernel={runtime()}>
          <Desktop onOpenPath={openPath} />
        </KernelProvider>
      )}
    </Show>
  );
}

export default App;
