/**
 * process_queue.js
 *
 * - Processes up to 5 submissions from submissions.json
 * - Enforces a 3-minute cooldown between runs via a .cooldown file
 * - If the queue is empty, waits 2 minutes (idle wait) then exits and sets cooldown
 * - Injects new submissions into the top of the <div id="submissions"> of the correct HTML page.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const SUBMISSIONS_FILE = path.join(REPO_ROOT, "submissions.json");
const COOLDOWN_FILE = path.join(REPO_ROOT, ".cooldown");
const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
const IDLE_WAIT_MS = 2 * 60 * 1000; // 2 minutes
const MAX_PER_RUN = 5;

const TARGET_MAP = {
  mp3: "audio.html",
  gif: "gifs.html",
  jpg: "images.html",
  jpeg: "images.html",
  png: "images.html",
  webp: "images.html"
};

function readCooldown() {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) return 0;
    const txt = fs.readFileSync(COOLDOWN_FILE, "utf8").trim();
    return parseInt(txt, 10) || 0;
  } catch (err) {
    console.warn("Could not read cooldown file:", err.message);
    return 0;
  }
}

function writeCooldown(ts = Date.now()) {
  try {
    fs.writeFileSync(COOLDOWN_FILE, String(ts), { encoding: "utf8" });
  } catch (err) {
    console.warn("Could not write cooldown file:", err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureFileExists(fp, defaultContent = "[]") {
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, defaultContent, "utf8");
  }
}

function chooseTargetByUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;
  const lower = fileUrl.split("?")[0].toLowerCase();
  const ext = lower.split(".").pop();
  return TARGET_MAP[ext] || null;
}

function buildHtmlSnippet(sub) {
  const username = sub.username || "unknown";
  const fileUrl = sub.file_url || sub.url || "";
  const desc = sub.description || "";
  const now = new Date().toLocaleString();
  const pfp = `https://github.com/${username}.png`;

  const isAudio = fileUrl.toLowerCase().endsWith(".mp3");
  const mediaHtml = isAudio
    ? `<audio class="submission-media" controls preload="none"><source src="${fileUrl}"></audio>`
    : `<img class="submission-media" src="${fileUrl}" alt="${desc.replace(/"/g, "&quot;")}" />`;

  return `
  <div class="submission">
    <div class="submission-top">
      <img class="submission-pfp" src="${pfp}" alt="${username}'s avatar" width="40" height="40" />
      <div class="submission-meta">
        <strong class="submission-name">${username}</strong>
        <span class="submission-date">${now}</span>
      </div>
    </div>
    <div class="submission-body">
      ${mediaHtml}
      <p class="submission-desc">${desc.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
  </div>
`;
}

function insertIntoHtmlAtTop(htmlPath, snippet) {
  if (!fs.existsSync(htmlPath)) {
    console.warn("Target HTML not found:", htmlPath);
    return false;
  }
  let html = fs.readFileSync(htmlPath, "utf8");
  const openDivRegex = /<div\s+[^>]*id=["']submissions["'][^>]*>/i;
  const m = html.match(openDivRegex);
  if (!m) {
    console.warn("No <div id=\"submissions\"> found in", htmlPath);
    return false;
  }
  const insertPos = m.index + m[0].length;
  const newHtml = html.slice(0, insertPos) + "\n" + snippet + "\n" + html.slice(insertPos);
  fs.writeFileSync(htmlPath, newHtml, "utf8");
  return true;
}

async function main() {
  const now = Date.now();
  const last = readCooldown();
  if (now - last < COOLDOWN_MS) {
    console.log("⏳ Cooldown active. Skipping this run.");
    return;
  }

  ensureFileExists(SUBMISSIONS_FILE, "[]");

  let submissions = [];
  try {
    submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf8") || "[]");
    if (!Array.isArray(submissions)) submissions = [];
  } catch (err) {
    console.error("Error parsing submissions.json:", err.message);
    submissions = [];
  }

  if (submissions.length === 0) {
    console.log("⚠️ No submissions in queue. Waiting 2 minutes before idling...");
    await sleep(IDLE_WAIT_MS);
    writeCooldown();
    console.log("🛌 Idle complete; cooldown set.");
    return;
  }

  const toProcess = submissions.splice(0, MAX_PER_RUN);
  console.log(`✅ Will process ${toProcess.length} submission(s).`);

  for (const sub of toProcess) {
    const fileUrl = sub.file_url || sub.url || "";
    const target = chooseTargetByUrl(fileUrl);
    if (!target) {
      console.warn("Could not determine target for submission, skipping:", fileUrl);
      continue;
    }
    const targetPath = path.join(REPO_ROOT, target);
    const snippet = buildHtmlSnippet(sub);
    const ok = insertIntoHtmlAtTop(targetPath, snippet);
    console.log(`${ok ? "Inserted into" : "Failed to insert into"} ${target}`);
  }

  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), "utf8");
    console.log("Saved updated submissions.json (remaining:", submissions.length, ")");
  } catch (err) {
    console.error("Error writing submissions.json:", err.message);
  }

  writeCooldown();
  console.log("Cooldown written. Done.");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Unhandled error in process_queue.js:", err);
    process.exit(1);
  });
}
