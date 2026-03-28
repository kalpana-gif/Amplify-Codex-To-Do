"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateClient } from "aws-amplify/data";
import {
  configureAmplify,
  getTodoRestApiEndpoint,
  hasAmplifyDataConfig,
} from "@/lib/amplify-client";
import type { Schema } from "../../../amplify/data/resource";

type Todo = {
  id: string;
  content: string | null;
  jiraTicket?: string | null;
  description?: string | null;
  isDone: boolean | null;
  statusLogs?: (string | null)[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type StatusFilter = "all" | "open" | "done";
type SortMode = "newest" | "updated" | "jira";
type BulkAction = "marking-done" | "clearing-done" | null;

type EditDraft = {
  content: string;
  jiraTicket: string;
  description: string;
  statusNote: string;
};

const EMPTY_EDIT_DRAFT: EditDraft = {
  content: "",
  jiraTicket: "",
  description: "",
  statusNote: "",
};

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

function findJiraKey(content: string | null | undefined) {
  if (!content) {
    return null;
  }

  const match = content.match(JIRA_KEY_PATTERN);
  return match ? match[1] : null;
}

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

function getTodoJiraKey(todo: Todo) {
  return normalizeJiraTicket(todo.jiraTicket) ?? findJiraKey(todo.content);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "No timestamp";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function parseStatusLog(entry: string) {
  const [timestamp, status, ...noteParts] = entry.split(" | ");
  if (!timestamp || !status) {
    return null;
  }

  return {
    timestamp,
    status,
    note: noteParts.join(" | "),
  };
}

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [newJiraTicket, setNewJiraTicket] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionTodoId, setActionTodoId] = useState<string | null>(null);
  const [savingNoteTodoId, setSavingNoteTodoId] = useState<string | null>(null);
  const [quickNotes, setQuickNotes] = useState<Record<string, string>>({});
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(EMPTY_EDIT_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [jiraOnly, setJiraOnly] = useState(false);
  const [jiraBaseUrl, setJiraBaseUrl] = useState(
    "https://your-company.atlassian.net/browse",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const clientState = useMemo(() => {
    if (!hasAmplifyDataConfig()) {
      return {
        client: null,
        initError:
          "Amplify outputs are missing Data API configuration. Start sandbox, then sync amplify_outputs.json into this app.",
      };
    }

    try {
      configureAmplify();
      return { client: generateClient<Schema>(), initError: null };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize Amplify client.";
      return { client: null, initError: message };
    }
  }, []);

  const client = clientState.client;
  const clientReady = client !== null;

  useEffect(() => {
    if (clientState.initError) {
      setErrorMessage(clientState.initError);
    }
  }, [clientState.initError]);

  useEffect(() => {
    const saved = window.localStorage.getItem("jiraBaseUrl");
    if (saved) {
      setJiraBaseUrl(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("jiraBaseUrl", jiraBaseUrl);
  }, [jiraBaseUrl]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const loadTodos = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }

    setErrorMessage(null);
    setLoading(true);
    try {
      const { data, errors } = await client.models.Todo.list({ limit: 200 });
      if (errors?.length) {
        throw new Error(errors[0].message);
      }

      setTodos(data as Todo[]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load todos.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  const remainingCount = useMemo(
    () => todos.filter((todo) => !todo.isDone).length,
    [todos],
  );
  const completedCount = todos.length - remainingCount;
  const completionRatio =
    todos.length > 0 ? Math.round((completedCount / todos.length) * 100) : 0;

  const latestUpdate = useMemo(() => {
    const latest = todos.reduce<string | null>((latestTimestamp, todo) => {
      const candidate = todo.updatedAt ?? todo.createdAt ?? null;
      if (!candidate) {
        return latestTimestamp;
      }
      if (!latestTimestamp) {
        return candidate;
      }

      return new Date(candidate).getTime() > new Date(latestTimestamp).getTime()
        ? candidate
        : latestTimestamp;
    }, null);

    return formatDateTime(latest);
  }, [todos]);

  const jiraBrowseBase = useMemo(
    () => jiraBaseUrl.trim().replace(/\/+$/, ""),
    [jiraBaseUrl],
  );

  const todoRestApiBase = useMemo(() => {
    const endpoint = getTodoRestApiEndpoint();
    return endpoint ? endpoint.replace(/\/+$/, "") : null;
  }, []);

  const apiModeLabel = todoRestApiBase
    ? "Amplify REST + GraphQL"
    : "GraphQL + local REST fallback";

  const hasActiveFilters = Boolean(
    query.trim() || statusFilter !== "all" || jiraOnly || sortMode !== "newest",
  );

  const visibleTodos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = todos.filter((todo) => {
      const done = Boolean(todo.isDone);

      if (statusFilter === "open" && done) {
        return false;
      }
      if (statusFilter === "done" && !done) {
        return false;
      }

      const jiraKey = getTodoJiraKey(todo);
      if (jiraOnly && !jiraKey) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const content = (todo.content ?? "").toLowerCase();
      const description = (todo.description ?? "").toLowerCase();
      const logs = normalizeStatusLogs(todo.statusLogs).join(" ").toLowerCase();

      return (
        content.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        (jiraKey ?? "").toLowerCase().includes(normalizedQuery) ||
        logs.includes(normalizedQuery)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "jira") {
        const jiraA = getTodoJiraKey(a) ?? "ZZZ";
        const jiraB = getTodoJiraKey(b) ?? "ZZZ";
        return jiraA.localeCompare(jiraB);
      }

      const aTimestamp =
        sortMode === "updated"
          ? a.updatedAt ?? a.createdAt ?? ""
          : a.createdAt ?? "";
      const bTimestamp =
        sortMode === "updated"
          ? b.updatedAt ?? b.createdAt ?? ""
          : b.createdAt ?? "";

      return new Date(bTimestamp).getTime() - new Date(aTimestamp).getTime();
    });
  }, [jiraOnly, query, sortMode, statusFilter, todos]);

  const patchTodo = useCallback(
    async (todoId: string, payload: Record<string, unknown>) => {
      const editUrl = todoRestApiBase
        ? `${todoRestApiBase}/todos/${todoId}`
        : `/api/todos/${todoId}`;

      const response = await fetch(editUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response
        .json()
        .catch(() => ({}))) as { error?: string; data?: Todo };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to update todo.");
      }

      return result.data;
    },
    [todoRestApiBase],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const content = newTodo.trim();
    const jiraTicket = normalizeJiraTicket(newJiraTicket);
    const description = normalizeDescription(newDescription);

    if (!content || saving) {
      return;
    }

    if (content.length > 140) {
      setErrorMessage("Task title must be 140 characters or less.");
      return;
    }

    if (description && description.length > 1200) {
      setErrorMessage("Description must be 1200 characters or less.");
      return;
    }

    setErrorMessage(null);
    setSaving(true);

    try {
      if (todoRestApiBase) {
        const response = await fetch(`${todoRestApiBase}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            jiraTicket,
            description,
          }),
        });

        const payload = (await response
          .json()
          .catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to create todo.");
        }
      } else {
        if (!client) {
          throw new Error("Amplify client is not available.");
        }

        const { errors } = await client.models.Todo.create({
          content,
          jiraTicket: jiraTicket ?? undefined,
          description: description ?? undefined,
          isDone: false,
          statusLogs: [makeStatusLog("OPEN", "Task created")],
        });

        if (errors?.length) {
          throw new Error(errors[0].message);
        }
      }

      setNewTodo("");
      setNewJiraTicket("");
      setNewDescription("");
      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create todo.";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (todo: Todo) => {
    setErrorMessage(null);
    setActionTodoId(todo.id);

    try {
      await patchTodo(todo.id, { isDone: !Boolean(todo.isDone) });
      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update todo.";
      setErrorMessage(message);
    } finally {
      setActionTodoId(null);
    }
  };

  const handleDelete = async (todoId: string) => {
    if (!client) {
      return;
    }

    setErrorMessage(null);
    setActionTodoId(todoId);

    try {
      const { errors } = await client.models.Todo.delete({ id: todoId });
      if (errors?.length) {
        throw new Error(errors[0].message);
      }

      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete todo.";
      setErrorMessage(message);
    } finally {
      setActionTodoId(null);
    }
  };

  const handleStartEdit = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditDraft({
      content: todo.content ?? "",
      jiraTicket: todo.jiraTicket ?? "",
      description: todo.description ?? "",
      statusNote: "",
    });
  };

  const handleCancelEdit = () => {
    if (savingEdit) {
      return;
    }

    setEditingTodoId(null);
    setEditDraft(EMPTY_EDIT_DRAFT);
  };

  const handleEditSave = async (todoId: string) => {
    const content = editDraft.content.trim();
    const jiraTicket = normalizeJiraTicket(editDraft.jiraTicket);
    const description = normalizeDescription(editDraft.description);
    const statusNote = editDraft.statusNote.trim();

    if (!content || savingEdit) {
      return;
    }

    if (content.length > 140) {
      setErrorMessage("Task title must be 140 characters or less.");
      return;
    }

    if (description && description.length > 1200) {
      setErrorMessage("Description must be 1200 characters or less.");
      return;
    }

    setErrorMessage(null);
    setSavingEdit(true);

    try {
      await patchTodo(todoId, {
        content,
        jiraTicket,
        description,
        ...(statusNote ? { statusNote } : {}),
      });

      setEditingTodoId(null);
      setEditDraft(EMPTY_EDIT_DRAFT);
      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to edit todo.";
      setErrorMessage(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleQuickNote = async (todoId: string) => {
    const note = quickNotes[todoId]?.trim();

    if (!note || savingNoteTodoId) {
      return;
    }

    setErrorMessage(null);
    setSavingNoteTodoId(todoId);

    try {
      await patchTodo(todoId, { statusNote: note });
      setQuickNotes((current) => ({ ...current, [todoId]: "" }));
      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to log status note.";
      setErrorMessage(message);
    } finally {
      setSavingNoteTodoId(null);
    }
  };

  const handleResetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setSortMode("newest");
    setJiraOnly(false);
  };

  const handleMarkAllOpenDone = async () => {
    const openTodos = todos.filter((todo) => !todo.isDone);
    if (!openTodos.length || bulkAction) {
      return;
    }

    setErrorMessage(null);
    setBulkAction("marking-done");
    try {
      await Promise.all(
        openTodos.map((todo) =>
          patchTodo(todo.id, {
            isDone: true,
            statusNote: "Bulk update: marked done from board",
          }),
        ),
      );
      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to mark all open tasks done.";
      setErrorMessage(message);
    } finally {
      setBulkAction(null);
    }
  };

  const handleClearCompleted = async () => {
    if (!client) {
      return;
    }

    const completedTodos = todos.filter((todo) => Boolean(todo.isDone));
    if (!completedTodos.length || bulkAction) {
      return;
    }

    setErrorMessage(null);
    setBulkAction("clearing-done");
    try {
      const results = await Promise.all(
        completedTodos.map((todo) => client.models.Todo.delete({ id: todo.id })),
      );

      const firstError = results.find((result) => result.errors?.length)?.errors?.[0];
      if (firstError) {
        throw new Error(firstError.message);
      }

      await loadTodos();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear completed tasks.";
      setErrorMessage(message);
    } finally {
      setBulkAction(null);
    }
  };

  const filterButtons: Array<{ label: string; value: StatusFilter; count: number }> = [
    { label: "All", value: "all", count: todos.length },
    { label: "Open", value: "open", count: remainingCount },
    { label: "Done", value: "done", count: completedCount },
  ];

  return (
    <main className="app-shell min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[2.35fr_1fr]">
        <section className="glass-panel soft-focus fade-in-up rounded-3xl p-6 md:p-8">
          <header className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                  Engineering Workflow
                </p>
                <h1 className="text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">
                  Jira Delivery Task Board
                </h1>
                <p className="text-sm text-zinc-600">
                  Manual Jira mapping, API-aware updates, and status logging for daily execution.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-700">
                  {apiModeLabel}
                </span>
                <span className="inline-flex h-8 items-center rounded-xl border border-zinc-200 bg-white px-3 font-medium text-zinc-700">
                  Last update: {latestUpdate}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="glass-panel-strong rounded-2xl px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">Total Tasks</p>
                <p className="text-2xl font-bold text-zinc-900">{todos.length}</p>
              </article>
              <article className="glass-panel-strong rounded-2xl px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-600">Open Queue</p>
                <p className="text-2xl font-bold text-slate-800">{remainingCount}</p>
              </article>
              <article className="glass-panel-strong rounded-2xl px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-emerald-700">Completed</p>
                <p className="text-2xl font-bold text-emerald-800">{completedCount}</p>
              </article>
              <article className="glass-panel-strong rounded-2xl px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">Completion</p>
                <p className="text-2xl font-bold text-zinc-900">{completionRatio}%</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-200 via-emerald-300 to-green-400 transition-all"
                    style={{ width: `${completionRatio}%` }}
                  />
                </div>
              </article>
            </div>

            {!clientReady && (
              <p className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-800">
                Configure AWS credentials, run <code>npx ampx sandbox</code>, then sync with
                <code className="ml-1">npm run sync:amplify</code>.
              </p>
            )}
          </header>

          <form className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4" onSubmit={handleCreate}>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr_auto]">
              <input
                className="h-12 rounded-xl border border-zinc-300 bg-white px-4 text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Task title (e.g. Harden webhook retry flow)"
                value={newTodo}
                onChange={(event) => setNewTodo(event.target.value)}
                maxLength={140}
              />
              <input
                className="h-12 rounded-xl border border-zinc-300 bg-white px-4 text-zinc-900 uppercase outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                placeholder="Jira ticket (PLAT-123)"
                value={newJiraTicket}
                onChange={(event) => setNewJiraTicket(event.target.value)}
                maxLength={32}
              />
              <button
                type="submit"
                className="h-12 rounded-xl bg-zinc-900 px-5 font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={saving || !newTodo.trim()}
              >
                {saving ? "Adding..." : "Create Task"}
              </button>
            </div>
            <textarea
              className="min-h-24 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="Description: acceptance criteria, blockers, linked PRs, env notes, release steps..."
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              maxLength={1200}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
              <p>Press Enter on the title field to create quickly.</p>
              <p>{newDescription.length}/1200</p>
            </div>
          </form>

          <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-white/80 p-3 md:grid-cols-[1.6fr_auto_auto_1.4fr] md:items-center">
            <div className="flex gap-2">
              {filterButtons.map((button) => (
                <button
                  key={button.value}
                  type="button"
                  onClick={() => setStatusFilter(button.value)}
                  className={`h-10 min-w-0 flex-1 rounded-xl px-2 text-sm font-semibold transition ${
                    statusFilter === button.value
                      ? button.value === "done"
                        ? "bg-emerald-700 text-white"
                        : button.value === "open"
                          ? "bg-slate-700 text-white"
                          : "bg-zinc-900 text-white"
                      : button.value === "done"
                        ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : button.value === "open"
                          ? "border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {button.label} ({button.count})
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Sort</span>
              <select
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-slate-500"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="newest">Newest</option>
                <option value="updated">Recently Updated</option>
                <option value="jira">Jira Key</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setJiraOnly((current) => !current)}
              className={`h-10 rounded-xl px-3 text-sm font-semibold transition ${
                jiraOnly
                  ? "border border-sky-300 bg-sky-100 text-sky-800"
                  : "border border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {jiraOnly ? "Jira-only: On" : "Jira-only: Off"}
            </button>

            <input
              ref={searchInputRef}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="Search title, Jira, description, or status notes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs text-zinc-600">
            <p>
              Showing {visibleTodos.length} of {todos.length} tasks. Press <kbd>/</kbd> to focus
              search.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => void handleMarkAllOpenDone()}
                disabled={bulkAction !== null || remainingCount === 0}
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkAction === "marking-done" ? "Marking..." : "Mark All Open Done"}
              </button>
              <button
                type="button"
                onClick={() => void handleClearCompleted()}
                disabled={bulkAction !== null || completedCount === 0}
                className="inline-flex h-9 items-center rounded-xl border border-rose-200 bg-rose-50 px-3 font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkAction === "clearing-done" ? "Clearing..." : "Clear Completed"}
              </button>
            </div>
          </div>

          {errorMessage && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </p>
          )}

          <section className="mt-6 space-y-3">
            {loading && <p className="text-sm text-zinc-500">Loading tasks...</p>}

            {!loading && clientReady && visibleTodos.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-zinc-500">
                No tasks match your current filters.
              </p>
            )}

            {!loading &&
              visibleTodos.map((todo) => {
                const busy =
                  actionTodoId === todo.id ||
                  savingNoteTodoId === todo.id ||
                  (editingTodoId === todo.id && savingEdit);
                const editing = editingTodoId === todo.id;
                const jiraKey = getTodoJiraKey(todo);
                const jiraLink = jiraKey ? `${jiraBrowseBase}/${jiraKey}` : null;
                const statusLogs = normalizeStatusLogs(todo.statusLogs);
                const quickNote = quickNotes[todo.id] ?? "";

                return (
                  <article
                    key={todo.id}
                    className={`glass-panel-strong soft-focus rounded-2xl border p-4 transition ${
                      todo.isDone ? "border-emerald-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(todo.isDone)}
                        disabled={busy}
                        onChange={() => void handleToggle(todo)}
                        className="mt-1 h-5 w-5 cursor-pointer accent-slate-700"
                        title="Toggle done/open"
                      />

                      <div className="min-w-0 flex-1 space-y-3">
                        {!editing && (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={`text-sm font-semibold md:text-base ${
                                  todo.isDone
                                    ? "text-zinc-400 line-through"
                                    : "text-zinc-900"
                                }`}
                              >
                                {todo.content}
                              </p>
                              <span
                                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                                  todo.isDone
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {todo.isDone ? "DONE" : "OPEN"}
                              </span>
                            </div>

                            {todo.description && (
                              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                                {todo.description}
                              </p>
                            )}
                          </>
                        )}

                        {editing && (
                          <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
                            <input
                              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              value={editDraft.content}
                              maxLength={140}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  content: event.target.value,
                                }))
                              }
                              autoFocus
                            />

                            <input
                              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 uppercase outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              value={editDraft.jiraTicket}
                              maxLength={32}
                              placeholder="Jira ticket (optional)"
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  jiraTicket: event.target.value,
                                }))
                              }
                            />

                            <textarea
                              className="min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              value={editDraft.description}
                              maxLength={1200}
                              placeholder="Description (optional)"
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />

                            <input
                              className="h-10 w-full rounded-lg border border-zinc-300 px-3 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                              value={editDraft.statusNote}
                              maxLength={300}
                              placeholder="Status note for log (optional)"
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  statusNote: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" &&
                                  (event.metaKey || event.ctrlKey)
                                ) {
                                  event.preventDefault();
                                  void handleEditSave(todo.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  handleCancelEdit();
                                }
                              }}
                            />

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleEditSave(todo.id)}
                                disabled={!editDraft.content.trim() || savingEdit}
                                className="inline-flex h-9 items-center rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                              >
                                {savingEdit ? "Saving..." : "Save Changes"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                disabled={savingEdit}
                                className="inline-flex h-9 items-center rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
                              >
                                Cancel
                              </button>
                              <p className="text-xs text-zinc-500">
                                Save shortcut: Ctrl/Cmd + Enter
                              </p>
                            </div>
                          </div>
                        )}

                        {!editing && (
                          <div className="rounded-xl border border-zinc-200 bg-white p-2.5">
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              Quick Status Note
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <input
                                className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                placeholder="Log progress, blocker, or handoff note"
                                value={quickNote}
                                onChange={(event) =>
                                  setQuickNotes((current) => ({
                                    ...current,
                                    [todo.id]: event.target.value,
                                  }))
                                }
                                maxLength={300}
                              />
                              <button
                                type="button"
                                onClick={() => void handleQuickNote(todo.id)}
                                disabled={!quickNote.trim() || savingNoteTodoId === todo.id}
                                className="h-9 rounded-xl border border-zinc-300 bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                              >
                                {savingNoteTodoId === todo.id ? "Logging..." : "Log"}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600">
                            Created: {formatDateTime(todo.createdAt)}
                          </span>
                          {todo.updatedAt && (
                            <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600">
                              Updated: {formatDateTime(todo.updatedAt)}
                            </span>
                          )}
                          {jiraKey && (
                            <span className="rounded-md bg-sky-100 px-2 py-1 font-semibold text-sky-700">
                              {jiraKey}
                            </span>
                          )}
                        </div>

                        {statusLogs.length > 0 && (
                          <details className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                            <summary className="cursor-pointer select-none font-medium text-zinc-800">
                              Status history ({statusLogs.length})
                            </summary>
                            <ol className="mt-3">
                              {[...statusLogs].reverse().map((entry, index, entries) => {
                                const parsed = parseStatusLog(entry);
                                const isLast = index === entries.length - 1;
                                if (!parsed) {
                                  return (
                                    <li
                                      key={`${todo.id}-raw-log-${index}`}
                                      className={`relative pl-6 ${isLast ? "" : "pb-4"}`}
                                    >
                                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-zinc-400 ring-2 ring-white" />
                                      {!isLast && (
                                        <span className="absolute left-[4px] top-4 h-[calc(100%-0.5rem)] w-px bg-zinc-300" />
                                      )}
                                      <div className="rounded-md border border-zinc-200 bg-white px-2 py-1">
                                        {entry}
                                      </div>
                                    </li>
                                  );
                                }

                                return (
                                  <li
                                    key={`${todo.id}-log-${index}`}
                                    className={`relative pl-6 ${isLast ? "" : "pb-4"}`}
                                  >
                                    <span
                                      className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                                        parsed.status === "DONE"
                                          ? "bg-emerald-500"
                                          : "bg-slate-500"
                                      }`}
                                    />
                                    {!isLast && (
                                      <span className="absolute left-[4px] top-4 h-[calc(100%-0.5rem)] w-px bg-zinc-300" />
                                    )}
                                    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                        {parsed.status} · {formatDateTime(parsed.timestamp)}
                                      </p>
                                      <p className="text-xs text-zinc-700">
                                        {parsed.note || "No note"}
                                      </p>
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                          </details>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {!editing && (
                          <button
                            type="button"
                            disabled={busy}
                            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleStartEdit(todo)}
                          >
                            Edit
                          </button>
                        )}

                        {jiraLink && (
                          <a
                            href={jiraLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center rounded-xl border border-sky-200 px-3 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                          >
                            Open Jira
                          </a>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          className="inline-flex h-9 items-center rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void handleDelete(todo.id)}
                        >
                          {busy ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
          </section>
        </section>

        <aside className="glass-panel soft-focus fade-in-up space-y-5 rounded-3xl p-6 md:p-8">
          <h2 className="text-lg font-bold text-zinc-900">Jira Settings</h2>
          <p className="text-sm text-zinc-600">
            Configure once, then open tickets directly from each task card.
          </p>

          <input
            className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            value={jiraBaseUrl}
            onChange={(event) => setJiraBaseUrl(event.target.value)}
            placeholder="https://your-company.atlassian.net/browse"
          />

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">Working Style</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Use one task per deliverable, not per day.</li>
              <li>Add description for acceptance criteria and rollback plan.</li>
              <li>Log short status notes after each major update.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">Keyboard Tips</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Create quickly with Enter on the title field.</li>
              <li>Use Esc to cancel edit mode.</li>
              <li>Use Ctrl/Cmd + Enter to save an edit.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">API Path</p>
            <p className="mt-2">
              Create and edits use REST when available. List/delete still use GraphQL client models.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
