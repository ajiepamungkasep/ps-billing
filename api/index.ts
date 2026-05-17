import { createApp } from "../src/app";

const appPromise = createApp();

export default async function handler(request: Request): Promise<Response> {
  const app = await appPromise;
  return app.fetch(request);
}
