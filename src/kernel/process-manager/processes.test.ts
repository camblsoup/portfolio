import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { createProcessManager } from "./processes.ts";
import { ProcessError } from "./structure.ts";

describe("Process manager lifecycle", () => {
  it("spawns immutable snapshots and emits lifecycle events", () => {
    const manager = createProcessManager({
      firstPid: 40,
      clock: () => 123,
    });
    const events: string[] = [];
    manager.on(
      "spawned",
      ({ process }) => events.push(`spawned:${process.pid}`),
    );
    manager.on("stateChanged", ({ process, previousState }) => {
      events.push(`${previousState}->${process.state}`);
    });

    const process = manager.spawn({ appId: "demo.app", name: "Demo" });
    manager.transition(process.pid, "RUNNING");

    expect(process.state).toBe("READY");
    expect(manager.get(40)).toEqual({
      ...process,
      state: "RUNNING",
    });
    expect(events).toEqual(["spawned:40", "READY->RUNNING"]);
  });

  it("enforces state transitions and makes termination idempotent", () => {
    const manager = createProcessManager({ clock: () => 10 });
    const process = manager.spawn({ appId: "demo.app" });
    const terminated = manager.terminate(process.pid, "closed by user");

    expect(terminated.state).toBe("TERMINATED");
    expect(terminated.terminatedAt).toBe(10);
    expect(terminated.exitReason).toBe("closed by user");
    expect(manager.terminate(process.pid)).toEqual(terminated);
    expect(() => manager.transition(process.pid, "RUNNING")).toThrow(
      ProcessError,
    );
  });

  it("enforces singleton processes and permits relaunch after termination", () => {
    const manager = createProcessManager();
    const first = manager.spawn({ appId: "singleton.app", singleton: true });

    expect(() => manager.spawn({ appId: "singleton.app", singleton: true }))
      .toThrow(/live process already exists/);

    manager.terminate(first.pid);
    expect(manager.spawn({ appId: "singleton.app", singleton: true }).pid).toBe(
      2,
    );
  });

  it("tracks window associations without exposing mutable internal state", () => {
    const manager = createProcessManager();
    const process = manager.spawn({ appId: "demo.app" });
    manager.attachWindow(process.pid, "window-1");

    const snapshot = manager.get(process.pid)!;
    expect(snapshot.windowIds).toEqual(["window-1"]);
    expect(() => manager.attachWindow(process.pid, "window-1")).toThrow(
      /already attached/,
    );

    manager.detachWindow(process.pid, "window-1");
    expect(manager.get(process.pid)?.windowIds).toEqual([]);
  });

  it("unsubscribes event listeners", () => {
    const manager = createProcessManager();
    let calls = 0;
    const unsubscribe = manager.on("spawned", () => calls++);

    manager.spawn({ appId: "first.app" });
    unsubscribe();
    manager.spawn({ appId: "second.app" });

    expect(calls).toBe(1);
  });
});
