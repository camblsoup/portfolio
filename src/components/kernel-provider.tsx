import type { JSX } from "solid-js";
import { createContext, useContext } from "solid-js";
import type { Kernel } from "../kernel/kernel.ts";

const KernelContext = createContext<Kernel>();

export function KernelProvider(props: { kernel: Kernel; children: JSX.Element })
{
  return <KernelContext.Provider value={props.kernel}>{props.children}</KernelContext.Provider>;
}

export function useKernel(): Kernel
{
  const kernel = useContext(KernelContext);
  if (!kernel)
  {
    throw new Error("Kernel context is missing.");
  }
  return kernel;
}
