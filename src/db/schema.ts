import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const tag = sqliteTable("tag", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  color: text("color"),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const timeEntry = sqliteTable("time_entry", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  startAt: text("start_at").notNull(),
  endAt: text("end_at"),
  note: text("note"),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
  deleted: integer("deleted").notNull().default(0),
});

export const timeEntryTags = sqliteTable(
  "time_entry_tags",
  {
    timeEntryId: text("time_entry_id")
      .notNull()
      .references(() => timeEntry.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id),
  },
  (t) => [primaryKey({ columns: [t.timeEntryId, t.tagId] })],
);
