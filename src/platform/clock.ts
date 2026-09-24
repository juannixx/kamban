import { toISODate } from "../domain/dates";
import type { Clock } from "../store/appStore";

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  today: () => toISODate(new Date()),
  stamp: () => new Date().toISOString().replace(/[:.]/g, "-"),
  newId: () => crypto.randomUUID(),
};
