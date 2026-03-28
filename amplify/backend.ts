import { defineBackend } from '@aws-amplify/backend';
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { restTodo } from './functions/rest-todo/resource';

const backend = defineBackend({
  auth,
  data,
  restTodo,
});

const restApiStack = backend.createStack('rest-api');

const todoRestApi = new HttpApi(restApiStack, 'TodoRestApi', {
  apiName: 'todo-rest-api',
  corsPreflight: {
    allowOrigins: ['*'],
    allowHeaders: ['*'],
    allowMethods: [CorsHttpMethod.ANY],
  },
});

const todoRestIntegration = new HttpLambdaIntegration(
  'TodoRestIntegration',
  backend.restTodo.resources.lambda,
);

todoRestApi.addRoutes({
  path: '/todos',
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration: todoRestIntegration,
});

todoRestApi.addRoutes({
  path: '/todos/{id}',
  methods: [HttpMethod.GET, HttpMethod.PATCH, HttpMethod.DELETE],
  integration: todoRestIntegration,
});

backend.restTodo.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['appsync:GraphQL'],
    resources: [`${backend.data.resources.graphqlApi.arn}/*`],
  }),
);

backend.restTodo.addEnvironment(
  'APPSYNC_URL',
  backend.data.resources.cfnResources.cfnGraphqlApi.attrGraphQlUrl,
);

backend.addOutput({
  custom: {
    todo_rest_api_endpoint: todoRestApi.apiEndpoint,
    todo_rest_api_region: restApiStack.region,
  },
});
