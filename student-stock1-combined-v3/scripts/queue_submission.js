/**
 * queue_submission.js
 *
 * - Reads GitHub Action inputs (username, file_url, description, or issue body).
 * - Enforces strict issue format if ISSUE_BODY is provided.
 * - Logs EVERY valid submission into submissions_log/ with timestamp.
 * - Appends submission to submissions.json queue.
 * - "Justice system": once submitted, it's permanent, even if issue is deleted.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const SUBMISSIONS_FILE = path.join(REPO_ROOT, "submissions.json");
const LOG_DIR = path.join(REPO_ROOT, "submissions_log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const USERNAME = process.env.USERNAME || "unknown";
const FILE_URL = process.env.FILE_URL || "";
const DESCRIPTION = process.env.DESCRIPTION || "";
const ISSUE_BODY = process.env.ISSUE_BODY || "";

function ensureFileExists(fp, defaultContent = "[]") {
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, defaultContent, "utf8");
  }
}

function parseIssueBody(body) {
  const lines = body.trim().split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const nameLine = lines[0];
  const fileLine = lines[1];
  const descLine = lines[2] || "";

  const nameMatch = nameLine.match(/^\\(([^)]+)\\)/);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();

  const urlMatch = fileLine.match(/(https?:\\/\\/\\S+\\.(?:jpg|jpeg|png|webp|gif|mp3))/i);
  if (!urlMatch) return null;
  const url = urlMatch[1];

  const desc = descLine.replace(/^\\[|\\]$/g, "").trim();

  return {
    username: USERNAME,
    name: name,
    file_url: url,
    description: desc,
    date: new Date().toISOString()
  };
}

function logSubmission(sub) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `${ts}-${sub.username}.json`;
  const fpath = path.join(LOG_DIR, fname);
  fs.writeFileSync(fpath, JSON.stringify(sub, null, 2), "utf8");
  console.log("📝 Logged submission to", fpath);
}

function main() {
  ensureFileExists(SUBMISSIONS_FILE);
  let submissions = JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, "utf8"));

  let newSubmission = null;

  if (ISSUE_BODY) {
    newSubmission = parseIssueBody(ISSUE_BODY);
  } else if (FILE_URL) {
    newSubmission = {
      username: USERNAME,
      name: USERNAME,
      file_url: FILE_URL,
      description: DESCRIPTION,
      date: new Date().toISOString()
    };
  }

  if (!newSubmission) {
    console.log("❌ Submission did not match required format. Skipping.");
    return;
  }

  // Log to submissions_log/
  logSubmission(newSubmission);

  // Append to submissions.json
  submissions.push(newSubmission);
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), "utf8");
  console.log("✅ Queued submission for:", newSubmission.username, newSubmission.file_url);
}

main();
