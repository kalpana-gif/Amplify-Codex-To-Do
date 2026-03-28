import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

declare const process: { env: Record<string, string | undefined> };

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

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
};

const LIST_TODOS_QUERY = /* GraphQL */ `
  query ListTodos($limit: Int) {
    listTodos(limit: $limit) {
      items {
        id
        content
        jiraTicket
        description
        isDone
        statusLogs
        createdAt
        updatedAt
      }
    }
  }
`;

const GET_TODO_QUERY = /* GraphQL */ `
  query GetTodo($id: ID!) {
    getTodo(id: $id) {
      id
      content
      jiraTicket
      description
      isDone
      statusLogs
      createdAt
      updatedAt
    }
  }
`;

const CREATE_TODO_MUTATION = /* GraphQL */ `
  mutation CreateTodo($input: CreateTodoInput!) {
    createTodo(input: $input) {
      id
      content
      jiraTicket
      description
      isDone
      statusLogs
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_TODO_MUTATION = /* GraphQL */ `
  mutation UpdateTodo($input: UpdateTodoInput!) {
    updateTodo(input: $input) {
      id
      content
      jiraTicket
      description
      isDone
      statusLogs
      createdAt
      updatedAt
    }
  }
`;

const DELETE_TODO_MUTATION = /* GraphQL */ `
  mutation DeleteTodo($input: DeleteTodoInput!) {
    deleteTodo(input: $input) {
      id
    }
  }
`;

const response = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

const noContent = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  headers: CORS_HEADERS,
  body: '',
});

const parseBody = (event: APIGatewayProxyEventV2): Record<string, unknown> => {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON body.');
  }
};

const normalizeJiraTicket = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeDescription = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeStatusLogs = (logs: (string | null)[] | null | undefined) =>
  Array.isArray(logs)
    ? logs.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

const makeStatusLog = (status: 'OPEN' | 'DONE', note: string) =>
  `${new Date().toISOString()} | ${status} | ${note}`;

const sortTodos = (items: Todo[]) =>
  [...items].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

const APPSYNC_URL = process.env.APPSYNC_URL;
const AWS_REGION = process.env.AWS_REGION;

if (!APPSYNC_URL || !AWS_REGION) {
  throw new Error('Missing APPSYNC_URL or AWS_REGION environment variables.');
}

const signer = new SignatureV4({
  credentials: defaultProvider(),
  region: AWS_REGION,
  service: 'appsync',
  sha256: Sha256,
});

const appsyncUrl = new URL(APPSYNC_URL);

const callAppSync = async <T,>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const body = JSON.stringify({ query, variables });
  const unsignedRequest = new HttpRequest({
    method: 'POST',
    protocol: appsyncUrl.protocol,
    hostname: appsyncUrl.hostname,
    port: appsyncUrl.port ? Number(appsyncUrl.port) : undefined,
    path: `${appsyncUrl.pathname}${appsyncUrl.search}`,
    headers: {
      host: appsyncUrl.host,
      'content-type': 'application/json',
    },
    body,
  });

  const signedRequest = await signer.sign(unsignedRequest);
  const requestHeaders = Object.fromEntries(
    Object.entries(signedRequest.headers).filter(([, value]) =>
      typeof value === 'string',
    ),
  ) as Record<string, string>;

  const apiResponse = await fetch(APPSYNC_URL, {
    method: 'POST',
    headers: requestHeaders,
    body,
  });

  const payload = (await apiResponse.json()) as GraphqlResponse<T>;

  if (!apiResponse.ok) {
    throw new Error(
      payload.errors?.[0]?.message ??
        `AppSync request failed with status ${apiResponse.status}.`,
    );
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  if (!payload.data) {
    throw new Error('AppSync response did not include data.');
  }

  return payload.data;
};

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return noContent();
    }

    const routeKey = event.routeKey;

    if (routeKey === 'GET /todos') {
      const data = await callAppSync<{
        listTodos: { items: Todo[] | null };
      }>(LIST_TODOS_QUERY, { limit: 200 });

      return response(200, { data: sortTodos(data.listTodos.items ?? []) });
    }

    if (routeKey === 'GET /todos/{id}') {
      const id = event.pathParameters?.id;
      if (!id) {
        return response(400, { error: 'Todo id is required.' });
      }

      const data = await callAppSync<{ getTodo: Todo | null }>(GET_TODO_QUERY, {
        id,
      });

      if (!data.getTodo) {
        return response(404, { error: 'Todo not found.' });
      }

      return response(200, { data: data.getTodo });
    }

    if (routeKey === 'POST /todos') {
      const body = parseBody(event);
      const content = typeof body.content === 'string' ? body.content.trim() : '';

      if (!content) {
        return response(400, { error: '`content` is required.' });
      }

      if (content.length > 140) {
        return response(400, { error: '`content` must be 140 characters or less.' });
      }

      const jiraTicket = normalizeJiraTicket(body.jiraTicket);
      const description = normalizeDescription(body.description);

      if (typeof body.description === 'string' && body.description.trim().length > 1200) {
        return response(400, {
          error: '`description` must be 1200 characters or less.',
        });
      }

      const input: Record<string, unknown> = {
        content,
        isDone: false,
        statusLogs: [makeStatusLog('OPEN', 'Task created')],
      };

      if (jiraTicket) {
        input.jiraTicket = jiraTicket;
      }

      if (description) {
        input.description = description;
      }

      const data = await callAppSync<{ createTodo: Todo }>(CREATE_TODO_MUTATION, {
        input,
      });

      return response(201, { data: data.createTodo });
    }

    if (routeKey === 'PATCH /todos/{id}') {
      const id = event.pathParameters?.id;
      if (!id) {
        return response(400, { error: 'Todo id is required.' });
      }

      const body = parseBody(event);
      const input: Record<string, unknown> = { id };
      let touched = false;

      if (typeof body.content !== 'undefined') {
        if (typeof body.content !== 'string') {
          return response(400, { error: '`content` must be a string.' });
        }

        const content = body.content.trim();
        if (!content) {
          return response(400, { error: '`content` cannot be empty.' });
        }

        if (content.length > 140) {
          return response(400, {
            error: '`content` must be 140 characters or less.',
          });
        }

        input.content = content;
        touched = true;
      }

      if (typeof body.jiraTicket !== 'undefined') {
        if (body.jiraTicket !== null && typeof body.jiraTicket !== 'string') {
          return response(400, {
            error: '`jiraTicket` must be a string or null.',
          });
        }

        input.jiraTicket = normalizeJiraTicket(body.jiraTicket) ?? null;
        touched = true;
      }

      if (typeof body.description !== 'undefined') {
        if (body.description !== null && typeof body.description !== 'string') {
          return response(400, {
            error: '`description` must be a string or null.',
          });
        }

        if (
          typeof body.description === 'string' &&
          body.description.trim().length > 1200
        ) {
          return response(400, {
            error: '`description` must be 1200 characters or less.',
          });
        }

        input.description = normalizeDescription(body.description) ?? null;
        touched = true;
      }

      const wantsStatusUpdate = typeof body.isDone !== 'undefined';
      const hasStatusNote =
        typeof body.statusNote === 'string' && body.statusNote.trim().length > 0;

      if (typeof body.statusNote !== 'undefined' && typeof body.statusNote !== 'string') {
        return response(400, {
          error: '`statusNote` must be a string when provided.',
        });
      }

      if (wantsStatusUpdate || hasStatusNote) {
        const currentTodoData = await callAppSync<{ getTodo: Todo | null }>(
          GET_TODO_QUERY,
          { id },
        );

        const currentTodo = currentTodoData.getTodo;
        if (!currentTodo) {
          return response(404, { error: 'Todo not found.' });
        }

        if (wantsStatusUpdate && typeof body.isDone !== 'boolean') {
          return response(400, { error: '`isDone` must be a boolean.' });
        }

        const currentStatus = currentTodo.isDone ? 'DONE' : 'OPEN';
        const nextStatus =
          wantsStatusUpdate && typeof body.isDone === 'boolean'
            ? body.isDone
              ? 'DONE'
              : 'OPEN'
            : currentStatus;

        if (wantsStatusUpdate && typeof body.isDone === 'boolean') {
          input.isDone = body.isDone;
          touched = true;
        }

        const note =
          hasStatusNote && typeof body.statusNote === 'string'
            ? body.statusNote.trim()
            : wantsStatusUpdate
              ? `Status changed from ${currentStatus} to ${nextStatus}`
              : 'Status note added';

        const nextLogs = [
          ...normalizeStatusLogs(currentTodo.statusLogs),
          makeStatusLog(nextStatus, note),
        ].slice(-100);

        input.statusLogs = nextLogs;
        touched = true;
      }

      if (!touched) {
        return response(400, {
          error:
            'Provide at least one field to update (`content`, `jiraTicket`, `description`, `isDone`, `statusNote`).',
        });
      }

      const data = await callAppSync<{ updateTodo: Todo | null }>(
        UPDATE_TODO_MUTATION,
        {
          input,
        },
      );

      if (!data.updateTodo) {
        return response(404, { error: 'Todo not found.' });
      }

      return response(200, { data: data.updateTodo });
    }

    if (routeKey === 'DELETE /todos/{id}') {
      const id = event.pathParameters?.id;
      if (!id) {
        return response(400, { error: 'Todo id is required.' });
      }

      await callAppSync<{ deleteTodo: { id: string } | null }>(
        DELETE_TODO_MUTATION,
        {
          input: { id },
        },
      );

      return response(200, { data: { id } });
    }

    return response(404, { error: `Route not found: ${routeKey}` });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected error while processing request.';

    return response(500, { error: message });
  }
};
