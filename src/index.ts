import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, gte, lte, isNull, inArray, or } from "drizzle-orm";
import * as schema from "./db/schema";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

export type Env = {
  DB: D1Database;
};

// TODO: Hardcoded user
const getUserId = async () => "parth";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

const isoDateSchema = z.iso.datetime({ offset: true });
const optionalNoteSchema = z.string().max(500).nullable().optional();
const tagIdsSchema = z.array(z.string().min(1)).max(20).optional();

const tagBodySchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

const timeEntriesQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine(
    (values) => {
      if (!values.from || !values.to) {
        return true;
      }

      return new Date(values.from).getTime() <= new Date(values.to).getTime();
    },
    { message: "`from` must be before `to`", path: ["to"] },
  );

const createTimeEntrySchema = z
  .object({
    startAt: isoDateSchema,
    endAt: isoDateSchema.optional(),
    note: optionalNoteSchema,
    tagIds: tagIdsSchema,
  })
  .refine(
    (values) => {
      if (!values.endAt) {
        return true;
      }

      return (
        new Date(values.endAt).getTime() >= new Date(values.startAt).getTime()
      );
    },
    { message: "`endAt` must be after `startAt`", path: ["endAt"] },
  );

const timerStartSchema = z.object({
  startAt: isoDateSchema.optional(),
  note: optionalNoteSchema,
  tagIds: tagIdsSchema,
});

const timerStopSchema = z.object({
  endAt: isoDateSchema.optional(),
  note: optionalNoteSchema,
  tagIds: tagIdsSchema,
});

const timerPatchSchema = z
  .object({
    note: optionalNoteSchema,
    tagIds: tagIdsSchema,
    startAt: isoDateSchema.optional(),
  })
  .refine(
    (data) =>
      data.note !== undefined ||
      data.tagIds !== undefined ||
      data.startAt !== undefined,
    { message: "At least one field must be provided" },
  );

type DB = ReturnType<typeof drizzle>;
type TagRow = typeof schema.tag.$inferSelect;
type TimeEntryRow = typeof schema.timeEntry.$inferSelect;
type TimeEntryWithTags = TimeEntryRow & { tags: TagRow[] };

const getDb = (env: Env) => drizzle(env.DB, { schema });

const defaultFrom = () => {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  fromDate.setHours(0, 0, 0, 0);
  return fromDate.toISOString();
};

const nowIso = () => new Date().toISOString();

const attachTagsToEntries = async (
  db: DB,
  entries: TimeEntryRow[],
): Promise<TimeEntryWithTags[]> => {
  if (entries.length === 0) {
    return [];
  }

  const entryIds = entries.map((entry) => entry.id);
  const tagRows = await db
    .select({
      timeEntryId: schema.timeEntryTags.timeEntryId,
      tag: schema.tag,
    })
    .from(schema.timeEntryTags)
    .innerJoin(schema.tag, eq(schema.timeEntryTags.tagId, schema.tag.id))
    .where(inArray(schema.timeEntryTags.timeEntryId, entryIds));

  const tagsByEntry = new Map<string, TagRow[]>();
  for (const row of tagRows) {
    const list = tagsByEntry.get(row.timeEntryId) ?? [];
    list.push(row.tag);
    tagsByEntry.set(row.timeEntryId, list);
  }

  return entries.map((entry) => ({
    ...entry,
    tags: tagsByEntry.get(entry.id) ?? [],
  }));
};

const getTimeEntryWithTags = async (
  db: DB,
  entryId: string,
): Promise<TimeEntryWithTags | null> => {
  const [entry] = await db
    .select()
    .from(schema.timeEntry)
    .where(eq(schema.timeEntry.id, entryId));
  if (!entry) {
    return null;
  }

  const [result] = await attachTagsToEntries(db, [entry]);
  return result ?? null;
};

const getActiveTimeEntry = async (
  db: DB,
  userId: string,
): Promise<TimeEntryRow | null> => {
  const [entry] = await db
    .select()
    .from(schema.timeEntry)
    .where(
      and(
        eq(schema.timeEntry.userId, userId),
        eq(schema.timeEntry.deleted, 0),
        isNull(schema.timeEntry.endAt),
      ),
    )
    .limit(1);

  return entry ?? null;
};

type TagValidationResult =
  | { ok: true; tagIds: string[] | undefined }
  | { ok: false; missing: string[] };

const validateTagIds = async (
  db: DB,
  userId: string,
  tagIds?: string[],
): Promise<TagValidationResult> => {
  if (tagIds === undefined) {
    return { ok: true, tagIds: undefined };
  }

  if (tagIds.length === 0) {
    return { ok: true, tagIds: [] };
  }

  const uniqueIds = Array.from(new Set(tagIds));
  const rows = await db
    .select({ id: schema.tag.id })
    .from(schema.tag)
    .where(
      and(eq(schema.tag.userId, userId), inArray(schema.tag.id, uniqueIds)),
    );

  const found = new Set(rows.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, tagIds: uniqueIds };
};

const syncTimeEntryTags = async (
  db: DB,
  entryId: string,
  tagIds?: string[],
) => {
  if (tagIds === undefined) {
    return;
  }

  await db
    .delete(schema.timeEntryTags)
    .where(eq(schema.timeEntryTags.timeEntryId, entryId));

  if (tagIds.length === 0) {
    return;
  }

  await db.insert(schema.timeEntryTags).values(
    tagIds.map((tagId) => ({
      timeEntryId: entryId,
      tagId,
    })),
  );
};

app.get("/api/health", (c) => {
  return c.text("ok");
});

app.get("/api/tags", async (c) => {
  const db = getDb(c.env);
  const userId = await getUserId();

  const rows = await db
    .select()
    .from(schema.tag)
    .where(eq(schema.tag.userId, userId));

  return c.json(rows);
});

app.post("/api/tags", zValidator("json", tagBodySchema), async (c) => {
  const db = getDb(c.env);
  const userId = await getUserId();
  const body = c.req.valid("json");

  const timestamp = nowIso();
  const id = crypto.randomUUID();

  await db.insert(schema.tag).values({
    id,
    userId,
    name: body.name,
    color: body.color ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const [tag] = await db.select().from(schema.tag).where(eq(schema.tag.id, id));

  return c.json(tag, 201);
});

app.get(
  "/api/time-entries",
  zValidator("query", timeEntriesQuerySchema),
  async (c) => {
    const db = getDb(c.env);
    const userId = await getUserId();
    const query = c.req.valid("query");

    const from = query.from ?? defaultFrom();
    const to = query.to ?? nowIso();

    const entries = await db
      .select()
      .from(schema.timeEntry)
      .where(
        and(
          eq(schema.timeEntry.userId, userId),
          eq(schema.timeEntry.deleted, 0),
          lte(schema.timeEntry.startAt, to),
          or(isNull(schema.timeEntry.endAt), gte(schema.timeEntry.endAt, from)),
        ),
      );

    const withTags = await attachTagsToEntries(db, entries);

    return c.json(withTags);
  },
);

app.post(
  "/api/time-entries",
  zValidator("json", createTimeEntrySchema),
  async (c) => {
    const db = getDb(c.env);
    const userId = await getUserId();
    const body = c.req.valid("json");

    const tagValidation = await validateTagIds(db, userId, body.tagIds);
    if (!tagValidation.ok) {
      return c.json(
        { error: `Invalid tag ids: ${tagValidation.missing.join(", ")}` },
        400,
      );
    }

    const id = crypto.randomUUID();
    const timestamp = nowIso();

    await db.insert(schema.timeEntry).values({
      id,
      userId,
      startAt: body.startAt,
      endAt: body.endAt ?? null,
      note: body.note ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: 0,
    });

    await syncTimeEntryTags(db, id, tagValidation.tagIds);

    const entry = await getTimeEntryWithTags(db, id);

    return c.json(entry, 201);
  },
);

app.get("/api/timers/active", async (c) => {
  const db = getDb(c.env);
  const userId = await getUserId();
  const activeEntry = await getActiveTimeEntry(db, userId);

  if (!activeEntry) {
    return c.json(null);
  }

  const [withTags] = await attachTagsToEntries(db, [activeEntry]);
  return c.json(withTags);
});

app.post(
  "/api/timers/start",
  zValidator("json", timerStartSchema),
  async (c) => {
    const db = getDb(c.env);
    const userId = await getUserId();
    const body = c.req.valid("json");

    const existing = await getActiveTimeEntry(db, userId);
    if (existing) {
      return c.json(
        {
          error:
            "An active timer is already running. Stop it before starting a new one.",
        },
        409,
      );
    }

    const tagValidation = await validateTagIds(db, userId, body.tagIds);
    if (!tagValidation.ok) {
      return c.json(
        { error: `Invalid tag ids: ${tagValidation.missing.join(", ")}` },
        400,
      );
    }

    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const startAt = body.startAt ?? timestamp;

    await db.insert(schema.timeEntry).values({
      id,
      userId,
      startAt,
      endAt: null,
      note: body.note ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      deleted: 0,
    });

    await syncTimeEntryTags(db, id, tagValidation.tagIds);

    const entry = await getTimeEntryWithTags(db, id);
    return c.json(entry, 201);
  },
);

app.post("/api/timers/stop", zValidator("json", timerStopSchema), async (c) => {
  const db = getDb(c.env);
  const userId = await getUserId();
  const body = c.req.valid("json");

  const activeEntry = await getActiveTimeEntry(db, userId);
  if (!activeEntry) {
    return c.json({ error: "No active timer to stop." }, 409);
  }

  const stopAt = body.endAt ?? nowIso();
  if (new Date(stopAt).getTime() < new Date(activeEntry.startAt).getTime()) {
    return c.json({ error: "endAt cannot be before startAt." }, 400);
  }

  const tagValidation = await validateTagIds(db, userId, body.tagIds);
  if (!tagValidation.ok) {
    return c.json(
      { error: `Invalid tag ids: ${tagValidation.missing.join(", ")}` },
      400,
    );
  }

  const timestamp = nowIso();
  const updates: Partial<typeof schema.timeEntry.$inferInsert> = {
    endAt: stopAt,
    updatedAt: timestamp,
  };

  if (body.note !== undefined) {
    updates.note = body.note;
  }

  await db
    .update(schema.timeEntry)
    .set(updates)
    .where(eq(schema.timeEntry.id, activeEntry.id));

  await syncTimeEntryTags(db, activeEntry.id, tagValidation.tagIds);

  const entry = await getTimeEntryWithTags(db, activeEntry.id);
  return c.json(entry);
});

app.patch(
  "/api/timers/active",
  zValidator("json", timerPatchSchema),
  async (c) => {
    const db = getDb(c.env);
    const userId = await getUserId();
    const body = c.req.valid("json");

    const activeEntry = await getActiveTimeEntry(db, userId);
    if (!activeEntry) {
      return c.json({ error: "No active timer to update." }, 409);
    }

    const tagValidation = await validateTagIds(db, userId, body.tagIds);
    if (!tagValidation.ok) {
      return c.json(
        { error: `Invalid tag ids: ${tagValidation.missing.join(", ")}` },
        400,
      );
    }

    const updates: Partial<typeof schema.timeEntry.$inferInsert> = {
      updatedAt: nowIso(),
    };

    if (body.startAt) {
      updates.startAt = body.startAt;
    }

    if (body.note !== undefined) {
      updates.note = body.note;
    }

    await db
      .update(schema.timeEntry)
      .set(updates)
      .where(eq(schema.timeEntry.id, activeEntry.id));

    await syncTimeEntryTags(db, activeEntry.id, tagValidation.tagIds);

    const entry = await getTimeEntryWithTags(db, activeEntry.id);
    return c.json(entry);
  },
);

app.post("/api/timers/cancel", async (c) => {
  const db = getDb(c.env);
  const userId = await getUserId();
  const activeEntry = await getActiveTimeEntry(db, userId);

  if (!activeEntry) {
    return c.json({ error: "No active timer to cancel." }, 409);
  }

  await db
    .update(schema.timeEntry)
    .set({ deleted: 1, updatedAt: nowIso() })
    .where(eq(schema.timeEntry.id, activeEntry.id));

  const entry = await getTimeEntryWithTags(db, activeEntry.id);
  return c.json(entry);
});

export default app;
