const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "inventory.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Load local environment values without overriding variables already exported
// by the shell or deployment environment.
const ENV_FILE = path.join(ROOT, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (entry && process.env[entry[1]] === undefined)
      process.env[entry[1]] = entry[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const PORT = Number(process.env.PORT || 3000);
const VENV_PYTHON = path.join(
  ROOT,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const PYTHON =
  process.env.PYTHON || (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3");

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    fs.writeFileSync(DATA_FILE, "[]\n");
    return [];
  }
}
let products = readData();
const save = () =>
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
function status(p) {
  if (p.quantity < 5) return "CRITICAL";
  if (p.quantity < 10) return "LOW";
  return "OK";
}
function enrich(p) {
  return {
    ...p,
    threshold: 10,
    status: status(p),
    restockQuantity: Math.max(0, 10 - Number(p.quantity)),
  };
}
function json(res, code, body) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 12_000_000) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};
const app = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      return res.end();
    }
    if (url.pathname === "/api/health")
      return json(res, 200, {
        ok: true,
        detector: process.env.ROBOFLOW_API_KEY ? "roboflow" : "unconfigured",
        message: process.env.ROBOFLOW_API_KEY
          ? "Roboflow workflow is configured."
          : "Set ROBOFLOW_API_KEY to enable Roboflow shelf detection.",
      });
    if (url.pathname === "/api/products" && req.method === "GET")
      return json(res, 200, { products: products.map(enrich) });
    if (url.pathname === "/api/detect" && req.method === "POST") {
      const x = await body(req);
      if (!x.image || !/^data:image\/(png|jpeg|jpg);base64,/.test(x.image))
        return json(res, 400, { error: "Upload a JPG or PNG image first." });
      if (!process.env.ROBOFLOW_API_KEY)
        return json(res, 503, {
          error: "Roboflow detection is not configured.",
          setup:
            "Set ROBOFLOW_API_KEY in the server environment and install requirements-optional.txt. Your uploaded image has not been processed.",
        });
      const run = spawnSync(PYTHON, [path.join(ROOT, "detector.py")], {
        input: JSON.stringify({ image: x.image }),
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 5_000_000,
      });
      if (run.error || run.status !== 0) {
        let failure = {};
        try {
          failure = JSON.parse(run.stderr || "{}");
        } catch {}
        const invalid =
          ["UnidentifiedImageError", "OSError", "ValueError"].includes(
            failure.type,
          ) && /image|decode|data/i.test(failure.error || "");
        return json(res, invalid ? 400 : 502, {
          error: invalid
            ? "The uploaded file is not a readable PNG or JPEG image."
            : failure.error ||
              "Roboflow inference failed. Check the workflow, API key, and network connection.",
          type: failure.type || "InferenceError",
        });
      }
      let result;
      try {
        result = JSON.parse(run.stdout);
      } catch {
        return json(res, 502, {
          error:
            "Roboflow returned an unreadable response. No inventory counts were changed.",
        });
      }
      if (!Array.isArray(result.classes) || !Array.isArray(result.detections))
        return json(res, 502, {
          error:
            "The workflow response did not contain recognized prediction data. No inventory counts were changed.",
        });
      const classTotal = result.classes.reduce(
        (sum, group) => sum + Number(group.count),
        0,
      );
      if (
        !Number.isInteger(result.count) ||
        result.count !== result.detections.length ||
        classTotal !== result.count
      )
        return json(res, 502, {
          error:
            "Roboflow predictions and class counts did not match. Inventory was not changed.",
        });
      const detectedAt = new Date().toISOString();
      products = result.classes.map((group) => {
        const name = String(group.name || "").trim();
        const count = Number(group.count);
        if (!name || !Number.isInteger(count) || count < 0)
          throw new Error(
            "Roboflow returned an invalid product class count. Inventory was not changed.",
          );
        const confidences = result.detections
          .filter((d) => d.class === name)
          .map((d) => Number(d.confidence))
          .filter(Number.isFinite);
        const avgConfidence = confidences.length
          ? confidences.reduce((sum, n) => sum + n, 0) / confidences.length
          : null;
        return {
          id: crypto.randomUUID(),
          name: name.slice(0, 100),
          sku: "ROBOFLOW",
          category: "Soft drinks",
          quantity: count,
          confidence: avgConfidence,
          detectedAt,
        };
      });
      save();
      result.products = products.map(enrich);
      return json(res, 200, result);
    }
    if (req.method === "GET") {
      let file = path.join(
        ROOT,
        url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname),
      );
      if (
        !file.startsWith(ROOT + path.sep) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      )
        return json(res, 404, { error: "Not found" });
      res.writeHead(200, {
        "content-type": mime[path.extname(file)] || "application/octet-stream",
      });
      return fs.createReadStream(file).pipe(res);
    }
    return json(res, 404, { error: "Not found" });
  } catch (e) {
    return json(res, 500, { error: e.message || "Server error" });
  }
});
app.listen(PORT, "127.0.0.1", () =>
  console.log(`Shelfwise is running at http://localhost:${PORT}`),
);
d 