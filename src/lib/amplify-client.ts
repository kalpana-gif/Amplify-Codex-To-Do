import { Amplify } from "aws-amplify";
import outputs from "../../amplify_outputs.json";

let configured = false;

type OutputsWithData = {
  data?: {
    url?: string;
  };
  custom?: {
    todo_rest_api_endpoint?: string;
  };
};

export function hasAmplifyDataConfig() {
  const parsed = outputs as OutputsWithData;
  return typeof parsed?.data?.url === "string" && parsed.data.url.length > 0;
}

export function configureAmplify() {
  if (configured) {
    return;
  }

  Amplify.configure(outputs, { ssr: true });
  configured = true;
}

export function getTodoRestApiEndpoint() {
  const parsed = outputs as OutputsWithData;
  const endpoint = parsed?.custom?.todo_rest_api_endpoint;
  return typeof endpoint === "string" && endpoint.length > 0 ? endpoint : null;
}
