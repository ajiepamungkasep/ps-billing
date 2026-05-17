import { createApp } from "./app";

const PORT = parseInt(process.env.PORT || "3000", 10);
const app = await createApp();

console.log(`🎮 PS Billing berjalan di http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
