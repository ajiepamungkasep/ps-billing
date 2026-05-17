import { createApp } from "../src/app.js";

const appPromise = createApp();

export default async function handler(request: Request): Promise<Response> {
  const app = await appPromise;
  return app.fetch(request);
}
