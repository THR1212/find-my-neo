import { appendFile } from "node:fs/promises";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { handleDomainLookup } from "./api/_lib/domainService.js";
import { generateNeoSites } from "./api/_lib/neoSite.js";
import { handleProfile } from "./api/_lib/profileService.js";
import { handleQuestions } from "./api/_lib/questionService.js";
import { handleReasons } from "./api/_lib/reasonService.js";
import { handleRationale } from "./api/_lib/rationaleService.js";
import { handlePlan } from "./api/_lib/planService.js";

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
      for (const k of [
        "LLM_MODE",
        "LLM_MODEL",
        "LLM_API_KEY",
        "LLM_BASE_URL",
        "NEO_COSITE_CHECK_URL",
        "NEO_COSITE_TOKEN_URL",
        "NEO_PARTNER_EMAIL",
        "NEO_PARTNER_PASSWORD",
        "NEO_PARTNER_ORIGIN",
        "NEO_PARTNER_IID",
        "NEO_COSITE_AUTH_HEADER",
        "NEO_COSITE_CHECK_TOKEN",
      ]) {
        if (env[k]) process.env[k] = env[k];
      }

      /**
       * Completed runs, appended to `runs.jsonl` (gitignored).
       *
       * The dev sink writes a FILE rather than printing, because this is the artefact for
       * refining: one JSON object per line, so `analysis/` can read it with the same Python
       * Darrel already uses, and it survives the terminal scrolling away. Production posts the
       * same record to api/run.ts, which logs instead.
       */
      server.middlewares.use("/api/run", (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          /* One object per line — a newline inside the JSON would break JSONL. Re-serialising
             also validates the body, so a malformed post is dropped with a message rather
             than corrupting the file for every run after it. */
          let line = "";
          try {
            line = JSON.stringify(JSON.parse(body || "{}")) + "\n";
          } catch {
            console.error("[run] dropped an unparseable body");
            res.statusCode = 204;
            res.end();
            return;
          }
          void appendFile("runs.jsonl", line, "utf8")
            .then(() => {
              try {
                const r = JSON.parse(body);
                console.error(
                  "[run]",
                  `${r.sid} asked=${(r.trail ?? []).length} prefilled=${(r.prefilled ?? []).join(",") || "-"} -> runs.jsonl`,
                );
              } catch {
                console.error("[run] appended (unparseable summary)");
              }
            })
            .catch((err) => console.error("[run] could not append:", String(err)));
          res.statusCode = 204;
          res.end();
        });
      });

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
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "private, no-store");

        const finish = async (bn: string, bd: string, ik: string) => {
          if (!bd.trim()) {
            res.statusCode = 400;
            res.end(JSON.stringify({ site: null, error: "missing `bd`" }));
            return;
          }
          try {
            const sites = await generateNeoSites(bn, bd, ik, 2);
            res.end(JSON.stringify({ site: sites[0] ?? null, sites }));
          } catch (err) {
            res.end(JSON.stringify({ site: null, error: String(err) }));
          }
        };

        if (req.method === "POST") {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            void (async () => {
              try {
                const body = JSON.parse(raw || "{}") as { bn?: unknown; bd?: unknown; ik?: unknown };
                await finish(
                  String(body.bn ?? "").slice(0, 55),
                  String(body.bd ?? "").slice(0, 2000),
                  String(body.ik ?? "").slice(0, 80),
                );
              } catch (err) {
                res.statusCode = 400;
                res.end(JSON.stringify({ site: null, error: String(err) }));
              }
            })();
          });
          return;
        }

        const u = new URL(req.url ?? "", "http://localhost");
        await finish(
          (u.searchParams.get("bn") ?? "").slice(0, 55),
          (u.searchParams.get("bd") ?? "").slice(0, 2000),
          (u.searchParams.get("ik") ?? "").slice(0, 80),
        );
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
      /* Object-bodied like /api/rationale, so it cannot share the businessText loop either. */
      server.middlewares.use("/api/plan", async (req, res) => {
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
            const { status, body } = await handlePlan(JSON.parse(raw || "{}"), sid);
            res.statusCode = status;
            res.end(JSON.stringify(body));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

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
