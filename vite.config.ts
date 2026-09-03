import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { handleDomainLookup } from "./api/_lib/domainService.js";
import { generateNeoSite } from "./api/_lib/neoSite.js";
import { handleProfile } from "./api/_lib/profileService.js";
import { handleQuestions } from "./api/_lib/questionService.js";
import { handleReasons } from "./api/_lib/reasonService.js";
import { handleRationale } from "./api/_lib/rationaleService.js";

/**
 * Mounts /api/domains on the dev server so `npm run dev` behaves like the deployed build.
 *
 * Without this, the demo would need `vercel dev` running — one more moving part on demo
 * morning. The API key is read from .env.local into process.env here, INSIDE the dev server,
 * so it never reaches the client bundle. Do not move this into src/.
 */
function domainApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: "domain-api-dev",
    configureServer(server) {
      // loadEnv doesn't populate process.env, and the services read from there.
      if (env.DOMSCAN_API_KEY) process.env.DOMSCAN_API_KEY = env.DOMSCAN_API_KEY;
      // Same for the model seam. These stay inside the dev server — never the client bundle.
      for (const k of ["LLM_MODE", "LLM_MODEL", "LLM_API_KEY", "LLM_BASE_URL"]) {
        if (env[k]) process.env[k] = env[k];
      }

      // Client error / degradation sink. Mirrors api/log.ts; prints to the dev terminal.
      server.middlewares.use("/api/log", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          console.error("[client-error]", body.slice(0, 800));
          res.statusCode = 204;
          res.end();
        });
      });

      // Neo's own site generator. Same handler the Vercel function uses.
      server.middlewares.use("/api/neo-site", async (req, res) => {
        const u = new URL(req.url ?? "", "http://localhost");
        res.setHeader("Content-Type", "application/json");
        const bd = (u.searchParams.get("bd") ?? "").slice(0, 2000);
        if (!bd.trim()) {
          res.statusCode = 400;
          res.end(JSON.stringify({ site: null, error: "missing `bd`" }));
          return;
        }
        try {
          const site = await generateNeoSite(
            (u.searchParams.get("bn") ?? "").slice(0, 55),
            bd,
            u.searchParams.get("ik") ?? "ecommerce_retail",
          );
          res.end(JSON.stringify({ site }));
        } catch (err) {
          res.end(JSON.stringify({ site: null, error: String(err) }));
        }
      });

      /* The two model steps. Same handlers the Vercel functions use. Separate routes so the
         guess screen never waits on question generation — see questionService's header. */
      for (const [path, fn] of [
        ["/api/profile", handleProfile],
        ["/api/questions", handleQuestions],
        ["/api/reasons", handleReasons],
      ] as const) {
        server.middlewares.use(path, async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "method not allowed" }));
          return;
        }
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            const { businessText } = JSON.parse(raw || "{}") as { businessText?: unknown };
            const sid = String(req.headers["x-fmn-session"] ?? "none").slice(0, 24);
            const { status, body } = await fn(businessText, sid);
            res.statusCode = status;
            res.end(JSON.stringify(body));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
        });
      }

      /* Takes a whole object rather than a bare businessText, so it cannot share the loop
         above. Same handler the Vercel function uses. */
      server.middlewares.use("/api/rationale", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "method not allowed" }));
          return;
        }
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          try {
            const sid = String(req.headers["x-fmn-session"] ?? "none").slice(0, 24);
            const { status, body } = await handleRationale(JSON.parse(raw || "{}"), sid);
            res.statusCode = status;
            res.end(JSON.stringify(body));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      server.middlewares.use("/api/domains", async (req, res) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const { status, body } = await handleDomainLookup(
          url.searchParams.get("name"),
          url.searchParams.get("tlds"),
        );
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // "" prefix loads every var, not just VITE_*. These stay server-side — see above.
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), domainApiPlugin(env)] };
});
