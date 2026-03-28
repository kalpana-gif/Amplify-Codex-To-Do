import { defineFunction } from '@aws-amplify/backend';

export const restTodo = defineFunction({
  name: 'restTodoHandler',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
});
