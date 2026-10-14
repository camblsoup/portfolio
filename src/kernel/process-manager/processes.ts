import {
  ProcessError,
  ProcessEventFor,
  ProcessEventType,
  ProcessInfo,
  ProcessState,
  SpawnOptions,
} from "./structure.ts";

type ProcessRecord = {
  pid: number;
  appId: string;
  name: string;
  state: ProcessState;
  parentPid?: number;
  windowIds: Set<string>;
  createdAt: number;
  terminatedAt?: number;
  exitReason?: string;
};

const validTransitions: Record<ProcessState, readonly ProcessState[]> = {
  READY: ["RUNNING", "BLOCKED", "TERMINATED"],
  RUNNING: ["BLOCKED", "TERMINATED"],
  BLOCKED: ["READY", "RUNNING", "TERMINATED"],
  TERMINATED: [],
};

/** Operations exposed by an in-memory process manager. */
export interface ProcessManager {
  /** Returns a snapshot for a PID, or undefined when it is unknown. */
  get(pid: number): ProcessInfo | undefined;
  /** Returns snapshots for all tracked processes. */
  list(): readonly ProcessInfo[];
  /** Creates a process in the READY state and emits a spawn event. */
  spawn(options: SpawnOptions): ProcessInfo;
  /** Moves a process through the validated lifecycle state machine. */
  transition(pid: number, nextState: ProcessState): ProcessInfo;
  /** Terminates a process and records its exit metadata. */
  terminate(pid: number, reason?: string): ProcessInfo;
  /** Associates a window ID with a process. */
  attachWindow(pid: number, windowId: string): void;
  /** Removes a window association from a process. */
  detachWindow(pid: number, windowId: string): void;
  /** Subscribes to a lifecycle event and returns an unsubscribe function. */
  on<T extends ProcessEventType>(
    eventType: T,
    listener: (event: ProcessEventFor<T>) => void,
  ): () => void;
}

/** Creates an isolated process manager with optional deterministic PID and clock sources. */
export function createProcessManager(
  options: { firstPid?: number; clock?: () => number } = {},
): ProcessManager {
  let nextPid = options.firstPid ?? 1;
  const clock = options.clock ?? (() => Date.now());
  const processes = new Map<number, ProcessRecord>();
  const listeners = new Map<ProcessEventType, Set<(event: never) => void>>();

  function requireProcess(pid: number): ProcessRecord {
    const process = processes.get(pid);
    if (!process) {
      throw new ProcessError("NOT_FOUND", `Process ${pid} does not exist.`);
    }
    return process;
  }

  function snapshot(process: ProcessRecord): ProcessInfo {
    return {
      pid: process.pid,
      appId: process.appId,
      name: process.name,
      state: process.state,
      ...(process.parentPid === undefined
        ? {}
        : { parentPid: process.parentPid }),
      windowIds: [...process.windowIds],
      createdAt: process.createdAt,
      ...(process.terminatedAt === undefined
        ? {}
        : { terminatedAt: process.terminatedAt }),
      ...(process.exitReason === undefined
        ? {}
        : { exitReason: process.exitReason }),
    };
  }

  function emit<T extends ProcessEventType>(
    eventType: T,
    event: ProcessEventFor<T>,
  ): void {
    for (const listener of listeners.get(eventType) ?? []) {
      listener(event as never);
    }
  }

  function get(pid: number): ProcessInfo | undefined {
    const process = processes.get(pid);
    return process ? snapshot(process) : undefined;
  }

  function spawn(spawnOptions: SpawnOptions): ProcessInfo {
    if (!spawnOptions.appId.trim()) {
      throw new ProcessError(
        "INVALID_PARENT",
        "Process appId cannot be empty.",
      );
    }

    if (
      spawnOptions.parentPid !== undefined &&
      !processes.has(spawnOptions.parentPid)
    ) {
      throw new ProcessError(
        "INVALID_PARENT",
        `Parent process ${spawnOptions.parentPid} does not exist.`,
      );
    }

    if (
      spawnOptions.singleton &&
      [...processes.values()].some(
        (process) =>
          process.appId === spawnOptions.appId &&
          process.state !== "TERMINATED",
      )
    ) {
      throw new ProcessError(
        "DUPLICATE_SINGLETON",
        `A live process already exists for '${spawnOptions.appId}'.`,
      );
    }

    const process: ProcessRecord = {
      pid: nextPid++,
      appId: spawnOptions.appId,
      name: spawnOptions.name?.trim() || spawnOptions.appId,
      state: "READY",
      parentPid: spawnOptions.parentPid,
      windowIds: new Set(),
      createdAt: spawnOptions.createdAt ?? clock(),
    };
    processes.set(process.pid, process);

    const processInfo = snapshot(process);
    emit("spawned", { type: "spawned", process: processInfo });
    return processInfo;
  }

  function transition(pid: number, nextState: ProcessState): ProcessInfo {
    const process = requireProcess(pid);
    if (process.state === nextState) return snapshot(process);

    if (!validTransitions[process.state].includes(nextState)) {
      throw new ProcessError(
        "INVALID_STATE",
        `Process ${pid} cannot transition from ${process.state} to ${nextState}.`,
      );
    }

    const previousState = process.state;
    process.state = nextState;
    const processInfo = snapshot(process);
    emit("stateChanged", {
      type: "stateChanged",
      process: processInfo,
      previousState,
    });
    return processInfo;
  }

  function terminate(pid: number, reason?: string): ProcessInfo {
    const process = requireProcess(pid);
    if (process.state === "TERMINATED") return snapshot(process);

    const previousState = process.state;
    process.state = "TERMINATED";
    process.terminatedAt = clock();
    process.exitReason = reason;
    const processInfo = snapshot(process);
    emit("terminated", {
      type: "terminated",
      process: processInfo,
      previousState,
    });
    return processInfo;
  }

  return {
    get,
    list: () => [...processes.values()].map(snapshot),
    spawn,
    transition,
    terminate,
    attachWindow(pid, windowId) {
      const process = requireProcess(pid);
      if (process.windowIds.has(windowId)) {
        throw new ProcessError(
          "DUPLICATE_WINDOW",
          `Window '${windowId}' is already attached to process ${pid}.`,
        );
      }
      process.windowIds.add(windowId);
    },
    detachWindow(pid, windowId) {
      const process = requireProcess(pid);
      if (!process.windowIds.delete(windowId)) {
        throw new ProcessError(
          "WINDOW_NOT_ATTACHED",
          `Window '${windowId}' is not attached to process ${pid}.`,
        );
      }
    },
    on(eventType, listener) {
      let eventListeners = listeners.get(eventType);
      if (!eventListeners) {
        eventListeners = new Set();
        listeners.set(eventType, eventListeners);
      }
      eventListeners.add(listener as (event: never) => void);
      return () => eventListeners!.delete(listener as (event: never) => void);
    },
  };
}
