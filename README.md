# student-stock1

This is a safe copy of your site (with a `1` suffix). It includes a queued-submission system with GitHub Actions.

## How it works

- **Queue submissions** (anytime) via the `Queue Submission` workflow (manual inputs).
- Every **3 minutes**, the `Process Submission Queue` workflow takes up to **5** queued items and adds cards to:
  - `audio.html` for `.mp3`
  - `gifs.html` for `.gif`
  - `images.html` for `.jpg`, `.jpeg`, `.png`, `.webp`
- New cards are inserted at the **top** of the `<div id="submissions">` on each page.

## Local Testing

```bash
npm run queue   # uses env vars USERNAME, FILE_URL, DESCRIPTION
npm run process # processes up to 5 items
```

Example:
```bash
USERNAME=octocat FILE_URL=https://placekitten.com/400/300 DESCRIPTION="test" npm run queue
npm run process
```

## Workflows

- `.github/workflows/queue-submission.yml` – manual dispatch to append to `submissions.json`
- `.github/workflows/process-submissions.yml` – scheduled (every 3 min) or manual to process up to 5

Note about .js vs .cjs
----------------------

This repository sets `"type": "module"` in `package.json`, which makes Node treat `.js` files as ES modules. A couple of scripts in `scripts/` use CommonJS `require()` and therefore must use the `.cjs` extension (for example `scripts/process_queue.cjs`). Other scripts that are written as ESM use `.js` and `import` (for example `scripts/queue_submission.js`).

If you edit or add scripts, keep this rule in mind to avoid runtime errors like `ReferenceError: require is not defined in ES module scope`.

## Notes

- If `audio.html`, `gifs.html`, or `images.html` didn’t exist, they were created with a placeholder.
- If any page lacked `<div id="submissions">`, it was added before `</body>`.
- The repo keeps your original files; nothing is overwritten except adding the container if missing.
```

