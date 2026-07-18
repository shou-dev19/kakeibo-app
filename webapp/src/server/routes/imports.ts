import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  previewImports,
  runImports,
  type ImportFileInput,
} from "../services/importer";

const imports = new Hono<AppEnv>();

interface ImportRequestBody {
  files?: Array<{
    filename?: string;
    contentBase64?: string;
    formatName?: string;
  }>;
}

/** Validate and normalize the request body into ImportFileInput[]. */
function parseFiles(body: ImportRequestBody): ImportFileInput[] | null {
  if (!body || !Array.isArray(body.files) || body.files.length === 0) return null;
  const files: ImportFileInput[] = [];
  for (const f of body.files) {
    if (typeof f.filename !== "string" || typeof f.contentBase64 !== "string") {
      return null;
    }
    files.push({
      filename: f.filename,
      contentBase64: f.contentBase64,
      formatName: typeof f.formatName === "string" ? f.formatName : undefined,
    });
  }
  return files;
}

/**
 * POST /api/imports/preview
 * Body: { files: [{ filename, contentBase64, formatName? }] }
 * Returns per-file: detected format, count, date range, duplicate count, error.
 */
imports.post("/preview", async (c) => {
  const body = await c.req.json<ImportRequestBody>().catch(() => null);
  const files = body ? parseFiles(body) : null;
  if (!files) return c.json({ error: "files is required" }, 400);

  const results = await previewImports(c.env.DB, files);
  return c.json({ files: results });
});

/**
 * POST /api/imports
 * Body: { files: [{ filename, contentBase64, formatName? }] }
 * Imports all files, each in isolation. Returns per-file imported /
 * duplicateSkipped / error counts.
 */
imports.post("/", async (c) => {
  const body = await c.req.json<ImportRequestBody>().catch(() => null);
  const files = body ? parseFiles(body) : null;
  if (!files) return c.json({ error: "files is required" }, 400);

  const results = await runImports(c.env.DB, files);
  return c.json({ files: results });
});

export default imports;
