/** Lifecycle states tracked by the process manager. */
export type ProcessState =
  | "READY"
  | "RUNNING"
  | "BLOCKED"
  | "TERMINATED";

/** Read-only process snapshot returned by the process manager. */
export interface ProcessInfo {
  readonly pid: number;
  readonly appId: string;
  readonly name: string;
  readonly state: ProcessState;
  readonly parentPid?: number;
  readonly windowIds: readonly string[];
  readonly createdAt: number;
  readonly terminatedAt?: number;
  readonly exitReason?: string;
}

/** Parameters used to create a process. */
export interface SpawnOptions {
  readonly appId: string;
  readonly name?: string;
  readonly parentPid?: number;
  readonly singleton?: boolean;
  readonly createdAt?: number;
}

/** Event emitted when a process is created. */
export interface ProcessSpawnedEvent {
  readonly type: "spawned";
  readonly process: ProcessInfo;
}

/** Event emitted after a process changes state. */
export interface ProcessStateChangedEvent {
  readonly type: "stateChanged";
  readonly process: ProcessInfo;
  readonly previousState: ProcessState;
}

/** Event emitted when a process enters the terminated state. */
export interface ProcessTerminatedEvent {
  readonly type: "terminated";
  readonly process: ProcessInfo;
  readonly previousState: ProcessState;
}

/** Union of process lifecycle events. */
export type ProcessEvent =
  | ProcessSpawnedEvent
  | ProcessStateChangedEvent
  | ProcessTerminatedEvent;

/** Names of events emitted by the process manager. */
export type ProcessEventType = ProcessEvent["type"];

/** Event payload associated with a specific event name. */
export type ProcessEventFor<T extends ProcessEventType> = Extract<
  ProcessEvent,
  { type: T }
>;

/** Error raised when a process operation violates a lifecycle rule. */
export class ProcessError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "INVALID_PARENT"
      | "DUPLICATE_SINGLETON"
      | "DUPLICATE_WINDOW"
      | "WINDOW_NOT_ATTACHED",
    message: string,
  ) {
    super(message);
    this.name = "ProcessError";
  }
}
