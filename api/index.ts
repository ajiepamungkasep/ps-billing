import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";

const app = await createApp();

export default handle(app);
