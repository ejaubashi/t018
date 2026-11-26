import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanBrief, composeInstructions, composeScore, maxBriefLength } from "../story/compose.js";
import { readScore, scoreAddress, scoreSchema } from "../story/spec.js?v=2";

const site = fileURLToPath(new URL("../", import.meta.url));
const folders = new Set(["story", "fonts", "exhibit", "lab", "playground", "experiments"]);
const rootFiles = new Set(["index.html", "style.css", "typefield.js"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};
const composePath = "/api/stories/compose";
const schemaPath = "/api/stories/schema";
const limitBytes = 4096;

function sendJSON(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBrief(request) {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError(415, "Send the brief as application/json.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limitBytes) break;
    chunks.push(chunk);
  }
  if (size > limitBytes) {
    request.resume();
    throw new RequestError(413, "The request is too large.");
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Send a JSON object with a brief.");
  }
  const brief = cleanBrief(value?.brief);
  const seed = value?.seed === undefined ? 0 : value.seed;
  if (!brief || Array.from(value.brief).length > maxBriefLength) {
    throw new RequestError(400, "Enter a brief of 1 to 240 characters.");
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RequestError(400, "Use an integer seed from 0 to 4294967295.");
  }
  return { brief, seed };
}

async function openAICompose(brief, seed, { key, model, signal, fetchResponse }) {
  const response = await fetchResponse("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, instructions: composeInstructions, input: JSON.stringify({ brief, seed }),
      store: false, max_output_tokens: 4000,
      text: { format: { type: "json_schema", name: "typefield_score_v2", strict: true, schema: scoreSchema } },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  });
  if (!response.ok) throw new Error("The model request failed.");
  const output = await response.json();
  const blocks = output.output.filter(item => item.type === "message").flatMap(item => item.content);
  if (blocks.some(block => block.type === "refusal")) {
    throw new RequestError(422, "The model could not compose from this brief.");
  }
  const text = blocks.find(block => block.type === "output_text")?.text;
  const score = text && readScore(JSON.parse(text));
  if (!score || output.status !== "completed") throw new Error("The model returned an incomplete score.");
  return score;
}

async function serveAsset(request, response, path) {
  const name = path.endsWith("/") ? path + "index.html" : path;
  const parts = name.slice(1).split("/");
  const type = types[extname(name)];
  const allowed = parts.length === 1 ? rootFiles.has(parts[0]) : folders.has(parts[0]);
  const filename = resolve(site, ...parts);
  if (!allowed || !type || !filename.startsWith(site.endsWith(sep) ? site : site + sep)) {
    throw new RequestError(404, "Page not found.");
  }
  let body;
  try {
    body = await readFile(filename);
  } catch {
    throw new RequestError(404, "Page not found.");
  }
  if (name === "/story/index.html") {
    body = body.toString().replace('name="typefield-compose-endpoint" content=""',
      'name="typefield-compose-endpoint" content="' + composePath + '"');
  }
  response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
  response.end(request.method === "HEAD" ? undefined : body);
}

export function storyServer({ key, model = "gpt-5-mini", fetchResponse = fetch } = {}) {
  return createServer(async (request, response) => {
    const job = new AbortController();
    response.once("close", () => { if (!response.writableFinished) job.abort(); });
    try {
      const url = new URL(request.url, "http://localhost");
      const path = decodeURIComponent(url.pathname);
      if (path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) throw new RequestError(400, "Invalid path.");
      if (path === composePath) {
        if (request.method !== "POST") {
          response.setHeader("Allow", "POST");
          throw new RequestError(405, "Use POST to compose a story.");
        }
        const { brief, seed } = await readBrief(request);
        const score = key ? await openAICompose(brief, seed, { key, model, signal: job.signal, fetchResponse })
          : composeScore(brief, seed);
        const editor = scoreAddress("http://localhost/story/", score);
        sendJSON(response, 200, { source: key ? "openai" : "typefield", score, editor: editor.pathname + editor.search });
      } else if (path === schemaPath && request.method === "GET") {
        sendJSON(response, 200, scoreSchema);
      } else if (path.startsWith("/api/")) {
        throw new RequestError(404, "API route not found.");
      } else if (request.method === "GET" || request.method === "HEAD") {
        if (path === "/story") {
          response.writeHead(307, { Location: "/story/" + url.search }).end();
        } else {
          await serveAsset(request, response, path);
        }
      } else {
        throw new RequestError(405, "Use GET for a page.");
      }
    } catch (error) {
      if (job.signal.aborted) return;
      const status = error instanceof RequestError ? error.status : error instanceof URIError ? 400 : 502;
      const message = error instanceof RequestError ? error.message
        : status === 400 ? "Invalid path." : "The composition service could not finish. Try again.";
      sendJSON(response, status, { error: message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { OPENAI_API_KEY, TYPEFIELD_MODEL, TYPEFIELD_HOST = "127.0.0.1", TYPEFIELD_PORT = "3000" } = process.env;
  storyServer({ key: OPENAI_API_KEY, model: TYPEFIELD_MODEL }).listen(Number(TYPEFIELD_PORT), TYPEFIELD_HOST, () => {
    console.log("Story Studio listening on http://" + TYPEFIELD_HOST + ":" + TYPEFIELD_PORT + "/story/");
  });
}
