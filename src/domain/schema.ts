import { z } from "zod";

export const CURRENT_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");
const isoDateTime = z.iso.datetime();

export const columnSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  order: z.number(),
  isDone: z.boolean(),
});

export const boardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    order: z.number(),
    columns: z.array(columnSchema),
    archived: z.boolean(),
  })
  .refine((board) => board.columns.filter((c) => c.isDone).length === 1, {
    message: "Cada quadro precisa ter exatamente uma coluna de concluídos",
  });

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
});

export const prioritySchema = z.enum(["low", "medium", "high"]);

export const cardSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  order: z.number(),
  title: z.string(),
  description: z.string().optional(),
  dueDate: isoDate.optional(),
  priority: prioritySchema.optional(),
  checklist: z.array(checklistItemSchema),
  archived: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime.optional(),
});

export const habitScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekdays") }),
  z.object({ type: z.literal("custom"), days: z.array(z.number().int().min(0).max(6)).min(1) }),
]);

export const habitSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  order: z.number(),
  archived: z.boolean(),
  schedule: habitScheduleSchema,
  createdAt: isoDateTime,
});

export const habitLogEntrySchema = z.object({
  habitId: z.string().min(1),
  date: isoDate,
});

export const kambanDataSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  boards: z.array(boardSchema),
  cards: z.array(cardSchema),
  habits: z.array(habitSchema),
  habitLog: z.array(habitLogEntrySchema),
});

export type Column = z.infer<typeof columnSchema>;
export type Board = z.infer<typeof boardSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Card = z.infer<typeof cardSchema>;
export type HabitSchedule = z.infer<typeof habitScheduleSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitLogEntry = z.infer<typeof habitLogEntrySchema>;
export type KambanData = z.infer<typeof kambanDataSchema>;
