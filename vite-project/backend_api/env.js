import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single consolidated .env at the repo root (two levels up from
// vite-project/backend_api), shared by the backend, the Python ANPR service,
// the Vite frontend and docker compose. Previously each service kept its own
// copy, which drifted — a stale duplicate is what broke the email
// verification links.
//
// Real environment variables always win: in Docker, compose injects config
// directly and there is no .env file inside the image, so `override: false`
// (dotenv's default) keeps the container's values authoritative.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
