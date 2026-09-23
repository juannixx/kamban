import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveScheduler, type SaveStatus } from "./saveScheduler";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(save: () => Promise<void> = async () => {}) {
  const statuses: SaveStatus[] = [];
  const saveFn = vi.fn(save);
  const scheduler = createSaveScheduler({ save: saveFn, onStatus: (s) => statuses.push(s) });
  return { scheduler, saveFn, statuses };
}

describe("createSaveScheduler", () => {
  it("agrupa mudanças próximas numa única gravação após 500 ms", async () => {
    const { scheduler, saveFn, statuses } = setup();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(499);
    expect(saveFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("saved");
    expect(scheduler.hasPendingChanges()).toBe(false);
  });

  it("flush grava na hora e não grava de novo depois", async () => {
    const { scheduler, saveFn } = setup();
    scheduler.schedule();
    await scheduler.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("flush sem mudanças pendentes não grava", async () => {
    const { scheduler, saveFn } = setup();
    await scheduler.flush();
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("mudança durante a gravação gera nova gravação depois", async () => {
    let release: () => void = () => {};
    const { scheduler, saveFn } = setup(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(saveFn).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    const flushed = scheduler.flush();
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushed;
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(scheduler.hasPendingChanges()).toBe(false);
  });

  it("após falha fica em error, mantém pendência e tenta de novo em 5 s", async () => {
    let fail = true;
    const { scheduler, saveFn, statuses } = setup(async () => {
      if (fail) throw new Error("EIO");
    });
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toBe("error");
    expect(scheduler.hasPendingChanges()).toBe(true);

    fail = false;
    await vi.advanceTimersByTimeAsync(4999);
    expect(saveFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("dispose cancela a gravação agendada", async () => {
    const { scheduler, saveFn } = setup();
    scheduler.schedule();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).not.toHaveBeenCalled();
  });
});
