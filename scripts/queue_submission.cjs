/**
 * queue_submission.js
 *
 * Strict issue parser with justice system logging.
 * Supports both direct links and Markdown image syntax from drag-and-drop.
 * Invalid submissions are logged under submissions_log/failed/ and skipped.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const SUBMISSIONS_FILE = path.join(REPO_ROOT, "submissions.json");
const LOG_DIR = path.join(REPO_ROOT, "submissions_log");
const FAILED_DIR = path.join(LOG_DIR, "failed");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
if (!fs.existsSync(FAILED_DIR)) fs.mkdirSync(FAILED_DIR);

const USERNAME = process.env.USERNAME || "unknown";
const ISSUE_BODY = process.env.ISSUE_BODY || "";
const FILE_URL = process.env.FILE_URL || "";
const DESCRIPTION = process.env.DESCRIPTION || "";

function ensureFileExists(fp, defaultContent = "[]") {
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, defaultContent, "utf8");
  }
}

function parseIssueBody(body) {
  const lines = body.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Line 1: (username) [date]
  const nameMatch = lines[0].match(/^\(([^)]+)\)\s*\[(.+)\]$/);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  const date = nameMatch[2].trim();

  // Line 2: file url or markdown image
  let fileLine = lines[1];
  let urlMatch = null;

  // plain url
  urlMatch = fileLine.match(/https?:\/\/\S+\.(jpg|jpeg|png|webp|gif|mp3)/i);
  if (!urlMatch) {
    // markdown image format ![alt](url)
    const mdMatch = fileLine.match(/!\[[^\]]*\]\((https?:\/\/\S+\.(jpg|jpeg|png|webp|gif|mp3))\)/i);
    if (mdMatch) urlMatch = [mdMatch[1]];
  }
  if (!urlMatch) return null;

  const url = urlMatch[0];
  const desc = (lines[2] || "").trim();

  return {
    username: USERNAME,
    name: name,
    file_url: url,
    description: desc,
    date: date || new Date().toISOString()
  };
}

function logSubmission(sub, failed = false) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = failed ? FAILED_DIR : LOG_DIR;
  const fname = `${ts}-${sub.username}.json`;
  const fpath = path.join(dir, fname);
  fs.writeFileSync(fpath, JSON.stringify(sub, null, 2), "utf8");
  console.log((failed ? "❌ Failed logged:" : "📝 Logged:"), fpath);
}

function main() {
  ensureFileExists(SUBMISSIONS_FILE);
  let submissions = [];
  try {
    submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf8"));
    if (!Array.isArray(submissions)) submissions = [];
  } catch (err) {
    console.error("❌ Failed to parse submissions.json, resetting:", err.message);
    submissions = [];
  }

  let newSubmission = null;

  if (ISSUE_BODY) {
    newSubmission = parseIssueBody(ISSUE_BODY);
  } else if (FILE_URL) {
    // fallback manual
    newSubmission = {
      username: USERNAME,
      name: USERNAME,
      file_url: FILE_URL,
      description: DESCRIPTION,
      date: new Date().toISOString()
    };
  }

  if (!newSubmission) {
    logSubmission({ username: USERNAME, body: ISSUE_BODY }, true);
    console.log("❌ Submission failed – invalid format");
    return;
  }

  logSubmission(newSubmission, false);
  submissions.push(newSubmission);
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), "utf8");
  console.log("✅ Queued submission for:", newSubmission.username, newSubmission.file_url);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error("❌ Fatal error in queue_submission.js:", err);
    process.exit(1);
  }
}
