const $ = (s) => document.querySelector(s);
let products = [];
let selectedImage = null;
let toastTimer;
const statusOrder = ["CRITICAL", "LOW", "OK"];
const icons = { "Soft drinks": "◒" };
const moneyless = (n) => Number(n).toLocaleString("en-US");
function showToast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const result = await res.json();
  if (!res.ok) {
    const error = new Error(result.error || "Request failed");
    error.payload = result;
    throw error;
  }
  return result;
}
function stockClass(p) {
  return p.status.toLowerCase();
}
function updateDashboard() {
  const total = products.reduce((n, p) => n + Number(p.quantity), 0),
    critical = products.filter((p) => p.status === "CRITICAL").length;
  const attention = products.filter((p) =>
    ["CRITICAL", "LOW"].includes(p.status),
  );
  $("#total-units").textContent = moneyless(total);
  $("#product-count").textContent = products.length;
  $("#attention-count").textContent = attention.length;
  $("#critical-count").textContent = critical;
  $("#restock-count").textContent = attention.length;
  $("#coverage-value").textContent = "—";
  $("#nav-count").textContent = products.length;
  $("#donut-total").textContent = products.length;
  renderChart();
  renderDistribution();
  renderTable();
  renderRestock();
}
function renderChart() {
  const visible = products.slice(0, 8);
  const max = Math.max(1, ...visible.map((p) => Number(p.quantity)));
  $("#bar-chart").innerHTML =
    visible
      .map((p) => {
        const height = Math.max(8, (Number(p.quantity) / max) * 95);
        return `<div class="bar-item ${stockClass(p)}"><div class="bar-stack" style="--height:${height}"><div class="bar-fill" style="--fill:100"></div></div><label title="${esc(p.name)}">${esc(p.name)}</label></div>`;
      })
      .join("") ||
    '<p class="empty">Run a Roboflow shelf scan to see detected counts.</p>';
}
function renderDistribution() {
  const counts = Object.fromEntries(
    statusOrder.map((s) => [s, products.filter((p) => p.status === s).length]),
  );
  const colors = { CRITICAL: "#cc776b", LOW: "#e5b56f", OK: "#568967" };
  let cursor = 0;
  const parts = statusOrder.map((s) => {
    const start = cursor;
    cursor += products.length ? (counts[s] / products.length) * 100 : 0;
    return `${colors[s]} ${start}% ${cursor}%`;
  });
  $("#donut").style.background = products.length
    ? `conic-gradient(${parts.join(",")})`
    : "#edf1ed";
  $("#distribution-legend").innerHTML = statusOrder
    .map(
      (s) =>
        `<span><i style="background:${colors[s]}"></i>${s === "OK" ? "Okay" : s[0] + s.slice(1).toLowerCase()} <b>${counts[s]}</b></span>`,
    )
    .join("");
  const lowest = [...products]
    .filter((p) => p.status === "CRITICAL" || p.status === "LOW")
    .sort((a, b) => a.quantity - b.quantity)[0];
  $("#insight-copy").textContent = lowest
    ? `${lowest.name}: ${lowest.quantity} detected. Restock priority is ${lowest.status === "CRITICAL" ? "critical" : "low"}.`
    : products.length
      ? "All detected classes have at least 10 units."
      : "A Roboflow scan will show stock health here.";
}
function renderTable() {
  const query = $("#search").value.trim().toLowerCase(),
    filter = $("#filter").value;
  const rows = products.filter(
    (p) =>
      (!query || p.name.toLowerCase().includes(query)) &&
      (filter === "all" || p.status === filter),
  );
  $("#inventory-body").innerHTML =
    rows
      .map((p) => {
        const pct = Math.min(100, (Number(p.quantity) / 10) * 100);
        return `<tr><td><div class="product-cell"><div class="product-thumb">${icons[p.category] || "◒"}</div><div><div class="product-name">${esc(p.name)}</div><div class="product-sku">Roboflow detected class</div></div></div></td><td><span class="quantity">${moneyless(p.quantity)}</span></td><td><span class="stock-track"><span class="stock-fill ${stockClass(p)}" style="display:block;width:${pct}%"></span></span><span class="stock-percent">${moneyless(p.restockQuantity)} to 10</span></td><td class="sales">${p.confidence == null ? "—" : `${(p.confidence * 100).toFixed(1)}%`}</td><td><span class="badge ${stockClass(p)}">${p.status === "OK" ? "OKAY" : p.status}</span></td></tr>`;
      })
      .join("") ||
    `<tr><td colspan="5" class="empty-row">${products.length ? "No matching detected classes." : "No Roboflow results yet. Scan a shelf to populate inventory."}</td></tr>`;
  $("#table-summary").textContent =
    `Showing ${rows.length} of ${products.length} products`;
}
function renderRestock() {
  const urgent = [...products]
    .filter((p) => ["CRITICAL", "LOW"].includes(p.status))
    .sort(
      (a, b) =>
        ({ CRITICAL: 0, LOW: 1 })[a.status] -
          { CRITICAL: 0, LOW: 1 }[b.status] || a.quantity - b.quantity,
    )
    .slice(0, 3);
  $("#restock-list").innerHTML = urgent.length
    ? urgent
        .map(
          (p) =>
            `<div class="restock-item"><div class="restock-thumb">◒</div><div><div class="restock-name">${esc(p.name)}</div><div class="restock-sub">${p.quantity} units detected · threshold is 10</div></div><span class="badge ${stockClass(p)}">${p.status}</span><span class="restock-qty">Add ${p.restockQuantity} units</span></div>`,
        )
        .join("")
    : products.length
      ? '<div class="empty-restock">All detected classes have 10 or more units.</div>'
      : '<div class="empty-restock">A Roboflow scan will create restock recommendations from detected counts.</div>';
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
async function refresh() {
  try {
    const [data, health] = await Promise.all([
      api("/api/products"),
      api("/api/health"),
    ]);
    products = data.products;
    updateDashboard();
    $("#demo-notice strong").textContent = products.length
      ? "Latest Roboflow inventory"
      : "No Roboflow scan yet";
    $("#detector-notice").textContent =
      health.detector === "roboflow"
        ? "Counts and status come from the latest successful Roboflow scan."
        : "Set ROBOFLOW_API_KEY in .env and install requirements-optional.txt to enable shelf scans.";
  } catch (e) {
    showToast(`Could not load inventory: ${e.message}`, true);
  }
}
function openScan() {
  selectedImage = null;
  $("#image-preview").src = "";
  $("#detection-canvas")
    .getContext("2d")
    .clearRect(
      0,
      0,
      $("#detection-canvas").width,
      $("#detection-canvas").height,
    );
  $("#drop-zone").classList.remove("has-image");
  $("#scan-result").textContent = "";
  $("#scan-result").className = "scan-result";
  $("#run-scan").disabled = true;
  $("#scan-dialog").showModal();
}
function bind() {
  ["#scan-button", "#scan-bottom", "#upload-nav", "#help-upload"].forEach((s) =>
    $(s).addEventListener("click", openScan),
  );
  $("#search").addEventListener("input", renderTable);
  $("#filter").addEventListener("change", renderTable);
  $("#dismiss-notice").addEventListener("click", () =>
    $("#demo-notice").remove(),
  );
  document
    .querySelectorAll(".close-dialog")
    .forEach((b) =>
      b.addEventListener("click", () => b.closest("dialog").close()),
    );
  $("#choose-image").addEventListener("click", () => $("#image-file").click());
  $("#image-file").addEventListener("change", (e) =>
    acceptImage(e.target.files?.[0]),
  );
  const zone = $("#drop-zone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.style.borderColor = "#579268";
  });
  zone.addEventListener("dragleave", () => (zone.style.borderColor = ""));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.style.borderColor = "";
    acceptImage(e.dataTransfer.files?.[0]);
  });
  $("#run-scan").addEventListener("click", async () => {
    if (!selectedImage) return;
    const result = $("#scan-result");
    result.className = "scan-result";
    result.textContent = "Sending image to Roboflow…";
    $("#run-scan").disabled = true;
    try {
      const data = await api("/api/detect", {
        method: "POST",
        body: JSON.stringify({ image: selectedImage }),
      });
      drawBoxes(data);
      products = data.products;
      updateDashboard();
      $("#demo-notice strong").textContent = products.length
        ? "Latest Roboflow inventory"
        : "No products detected";
      if (!data.classes.length) {
        result.textContent =
          "Roboflow returned no product detections. Inventory now reflects this scan.";
      } else {
        const summary = data.classes
          .map((c) => `${c.name}: ${c.count}`)
          .join(" · ");
        result.textContent = `${data.count} products detected. ${summary}. Inventory updated from this scan; confidence boxes are shown above.`;
      }
    } catch (e) {
      result.classList.add("error");
      result.textContent = `${e.message} ${e.payload?.setup || ""} No inventory counts were changed.`;
    } finally {
      $("#run-scan").disabled = false;
    }
  });
  $("#export-button").addEventListener("click", () => {
    const columns = [
      "name",
      "quantity",
      "confidence",
      "status",
      "restockQuantity",
      "detectedAt",
    ];
    const quote = (x) => `"${String(x ?? "").replaceAll('"', '""')}"`;
    const csv = [
      columns.join(","),
      ...products.map((p) => columns.map((k) => quote(p[k])).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "roboflow-inventory.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
function acceptImage(file) {
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    showToast("Choose a JPG or PNG image.", true);
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast("Image must be smaller than 8 MB.", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    selectedImage = reader.result;
    $("#image-preview").onload = () => {
      const c = $("#detection-canvas");
      c.width = $("#image-preview").naturalWidth;
      c.height = $("#image-preview").naturalHeight;
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
    };
    $("#image-preview").src = selectedImage;
    $("#drop-zone").classList.add("has-image");
    $("#run-scan").disabled = false;
    $("#scan-result").textContent =
      "Image ready. Detection availability will be checked when you continue.";
  };
  reader.readAsDataURL(file);
}
function drawBoxes(data) {
  const canvas = $("#detection-canvas"),
    ctx = canvas.getContext("2d"),
    sx = canvas.width / data.width,
    sy = canvas.height / data.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(2, canvas.width / 500);
  ctx.font = `bold ${Math.max(12, canvas.width / 45)}px sans-serif`;
  for (const d of data.detections || []) {
    const x = d.x1 * sx,
      y = d.y1 * sy,
      w = (d.x2 - d.x1) * sx,
      h = (d.y2 - d.y1) * sy;
    ctx.strokeStyle = "#92e6a8";
    ctx.fillStyle = "#92e6a8";
    ctx.strokeRect(x, y, w, h);
    const text = `${d.class} · ${Math.round(d.confidence * 100)}%`;
    const height = Math.max(20, canvas.width / 35);
    ctx.fillRect(
      x,
      Math.max(0, y - height),
      ctx.measureText(text).width + 12,
      height,
    );
    ctx.fillStyle = "#173722";
    ctx.fillText(text, x + 6, Math.max(height * 0.7, y - (height / 4) * 3));
  }
}
const now = new Date();
$(".eyebrow").innerHTML =
  `<span class="eyebrow-dot"></span> ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}`;
bind();
refresh();
