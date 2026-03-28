import { NextResponse } from "next/server";
import { generateClient } from "aws-amplify/data";
import { configureAmplify, hasAmplifyDataConfig } from "@/lib/amplify-client";
import type { Schema } from "../../../../../../amplify/data/resource";

export const runtime = "nodejs";

type PatchContext = {
  params: Promise<{ id: string }> | { id: string };
};

type PatchBody = {
  content?: unknown;
  isDone?: unknown;
  jiraTicket?: unknown;
  description?: unknown;
  statusNote?: unknown;
};

function normalizeJiraTicket(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDescription(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStatusLogs(logs: (string | null)[] | null | undefined) {
  return Array.isArray(logs)
    ? logs.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
}

function makeStatusLog(status: "OPEN" | "DONE", note: string) {
  return `${new Date().toISOString()} | ${status} | ${note}`;
}

export async function PATCH(request: Request, context: PatchContext) {
  if (!hasAmplifyDataConfig()) {
    return NextResponse.json(
      {
        error:
          "Amplify Data API is not configured. Sync amplify_outputs.json and retry.",
      },
      { status: 500 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Todo id is required." }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    configureAmplify();
    const client = generateClient<Schema>();

    const updateInput: Schema["Todo"]["updateType"] = { id };
    let touched = false;

    if (typeof body.content !== "undefined") {
      if (typeof body.content !== "string") {
        return NextResponse.json(
          { error: "`content` must be a string." },
          { status: 400 },
        );
      }

      const content = body.content.trim();
      if (!content) {
        return NextResponse.json(
          { error: "`content` cannot be empty." },
          { status: 400 },
        );
      }
      if (content.length > 140) {
        return NextResponse.json(
          { error: "`content` must be 140 characters or less." },
          { status: 400 },
        );
      }

      updateInput.content = content;
      touched = true;
    }

    if (typeof body.jiraTicket !== "undefined") {
      if (body.jiraTicket !== null && typeof body.jiraTicket !== "string") {
        return NextResponse.json(
          { error: "`jiraTicket` must be a string or null." },
          { status: 400 },
        );
      }

      updateInput.jiraTicket = normalizeJiraTicket(body.jiraTicket) ?? null;
      touched = true;
    }

    if (typeof body.description !== "undefined") {
      if (body.description !== null && typeof body.description !== "string") {
        return NextResponse.json(
          { error: "`description` must be a string or null." },
          { status: 400 },
        );
      }

      const normalizedDescription = normalizeDescription(body.description);
      if (normalizedDescription && normalizedDescription.length > 1200) {
        return NextResponse.json(
          { error: "`description` must be 1200 characters or less." },
          { status: 400 },
        );
      }

      updateInput.description = normalizedDescription ?? null;
      touched = true;
    }

    const wantsStatusUpdate = typeof body.isDone !== "undefined";
    const hasStatusNote =
      typeof body.statusNote === "string" && body.statusNote.trim().length > 0;

    if (typeof body.statusNote !== "undefined" && typeof body.statusNote !== "string") {
      return NextResponse.json(
        { error: "`statusNote` must be a string when provided." },
        { status: 400 },
      );
    }

    if (wantsStatusUpdate || hasStatusNote) {
      if (wantsStatusUpdate && typeof body.isDone !== "boolean") {
        return NextResponse.json(
          { error: "`isDone` must be a boolean." },
          { status: 400 },
        );
      }

      const { data: currentTodo, errors: getErrors } = await client.models.Todo.get({
        id,
      });

      if (getErrors?.length) {
        return NextResponse.json({ error: getErrors[0].message }, { status: 500 });
      }

      if (!currentTodo) {
        return NextResponse.json({ error: "Todo not found." }, { status: 404 });
      }

      const currentStatus = currentTodo.isDone ? "DONE" : "OPEN";
      const nextStatus =
        wantsStatusUpdate && typeof body.isDone === "boolean"
          ? body.isDone
            ? "DONE"
            : "OPEN"
          : currentStatus;

      if (wantsStatusUpdate && typeof body.isDone === "boolean") {
        updateInput.isDone = body.isDone;
        touched = true;
      }

      const note =
        hasStatusNote && typeof body.statusNote === "string"
          ? body.statusNote.trim()
          : wantsStatusUpdate
            ? `Status changed from ${currentStatus} to ${nextStatus}`
            : "Status note added";

      updateInput.statusLogs = [
        ...normalizeStatusLogs(currentTodo.statusLogs),
        makeStatusLog(nextStatus, note),
      ].slice(-100);
      touched = true;
    }

    if (!touched) {
      return NextResponse.json(
        {
          error:
            "Provide at least one field to update (`content`, `jiraTicket`, `description`, `isDone`, `statusNote`).",
        },
        { status: 400 },
      );
    }

    const { data, errors } = await client.models.Todo.update(updateInput);

    if (errors?.length) {
      return NextResponse.json({ error: errors[0].message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Todo not found." }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update todo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
