import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { handleDomainLookup } from "./api/_lib/domainService.js";
import { generateNeoSite } from "./api/_lib/neoSite.js";

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
      // loadEnv doesn't populate process.env, and domainService reads from there.
      if (env.DOMSCAN_API_KEY) process.env.DOMSCAN_API_KEY = env.DOMSCAN_API_KEY;

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
