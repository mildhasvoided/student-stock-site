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
const LOG_DIR = path.join(REPO_ROOT, "submissions_log");
const PROCESSED_DIR = path.join(LOG_DIR, "processed");
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
  // New preset template requested by the user.
  // Use the submission `name` (or username fallback) as the container id.
  const nameId = (sub.name || sub.username || "submission").replace(/[^a-zA-Z0-9_-]/g, "-");
  const fileUrl = sub.file_url || sub.url || "";
  const desc = (sub.description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Simple markup: container with id, image, description paragraph and download button.
  // The download button links to the file and uses the `download` attribute where supported.
  return `
<div id="${nameId}">
  <img src="${fileUrl}" alt="${desc.replace(/\"/g, '&quot;')}" />
  <p>${desc}</p>
  <a href="${fileUrl}" download><button type="button">download</button></a>
</div>
`;
}

function insertIntoHtmlAtTop(htmlPath, snippet) {
  if (!fs.existsSync(htmlPath)) {
    console.warn("Target HTML not found:", htmlPath);
    return false;
  }
  let html = fs.readFileSync(htmlPath, "utf8");
  // Prefer <div id="submissions">, fall back to <div id="content">, otherwise insert before </body>
  const submissionsRegex = /<div\s+[^>]*id=["']submissions["'][^>]*>/i;
  const contentRegex = /<div\s+[^>]*id=["']content["'][^>]*>/i;
  let m = html.match(submissionsRegex);
  let insertPos;
  if (m) {
    insertPos = m.index + m[0].length;
  } else {
    m = html.match(contentRegex);
    if (m) {
      insertPos = m.index + m[0].length;
    } else {
      // final fallback: before </body>
      const bodyClose = html.match(/<\/body>/i);
      if (!bodyClose) {
        console.warn("No suitable insertion point found in", htmlPath);
        return false;
      }
      insertPos = bodyClose.index;
    }
  }
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
    // prepare debug info
    const debug = {
      username: sub.username || 'unknown',
      name: sub.name || sub.username || null,
      fileUrl,
      decidedTarget: null,
      targetPath: null,
      targetExists: false,
      inserted: false,
      snippetPreview: null,
      timestamp: new Date().toISOString()
    };

    // primary detection
    let target = chooseTargetByUrl(fileUrl);
    // fallback: look for a known extension anywhere before query/hash
    if (!target) {
      const found = (fileUrl || '').match(/\.(jpg|jpeg|png|webp|gif|mp3)(?:$|[?#])/i);
      if (found) {
        target = TARGET_MAP[found[1].toLowerCase()];
      }
    }

    debug.decidedTarget = target || null;
    if (!target) {
      console.warn("Could not determine target for submission, skipping:", fileUrl);
      // ensure processed dir exists and write debug
      try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
        if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);
        const dname = `${Date.now()}-${debug.username}.json`;
        fs.writeFileSync(path.join(PROCESSED_DIR, dname), JSON.stringify(debug, null, 2), 'utf8');
      } catch (err) {
        console.warn('Could not write debug file:', err.message);
      }
      continue;
    }

    const targetPath = path.join(REPO_ROOT, target);
    debug.targetPath = targetPath;
    debug.targetExists = fs.existsSync(targetPath);

    const snippet = buildHtmlSnippet(sub);
    debug.snippetPreview = snippet.trim().split('\n').slice(0, 6).join('\n');

    const ok = insertIntoHtmlAtTop(targetPath, snippet);
    debug.inserted = !!ok;
    console.log(`${ok ? "Inserted into" : "Failed to insert into"} ${target} (path: ${targetPath})`);

    // write debug info
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
      if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);
      const dname = `${Date.now()}-${debug.username}.json`;
      fs.writeFileSync(path.join(PROCESSED_DIR, dname), JSON.stringify(debug, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not write processed debug file:', err.message);
    }
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
