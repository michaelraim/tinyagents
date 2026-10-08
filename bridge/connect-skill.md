---
name: connect-tinyagents
description: Connect this coding client to the user's tinyAGENTS office, retry an unfinished browser connection, or diagnose why its agents are missing.
---

Connect the installed plugin with its bundled helper. Resolve `../../scripts/office.mjs` relative to this SKILL.md's directory, quote the absolute path, and run it with Node:

```text
node <absolute-plugin-path>/scripts/office.mjs connect
```

The helper opens the browser and returns a public connection link. Show that link if approval is pending. The human signs in with GitHub or GitLab and approves their computer there. The helper saves its credential automatically; Codex and Claude Code in the same OS account share it. Preserve existing connections.

After browser approval, run `doctor`. Distinguish saved credentials from a confirmed activity receipt; a credential check alone does not prove hooks run. Compare its office ID with **My account & agents** on the website. Report the last receipt accurately, including when none exists.

For missing or delayed activity, run `doctor` and `logs` using the same helper. Version 0.6.3 records hook receipt, normalized event fingerprints, queueing, delivery duration, HTTP failures and retry exhaustion. Compare the provider and timestamps with the website's **Download diagnostics** report. No `hook.received` means investigate host hook discovery/trust; queued without sent means investigate delivery; sent to another office means use the explicit switch flow below. Retry with `flush` when appropriate. Do not manufacture hook events as proof or read/upload transcripts, configs or credentials. Only sessions emitting new hooks are discovered; saved inactive projects are not imported. Repository names are room names; renamed chat titles are separate.

If the user asks to switch to their signed-in office, run `connect --switch-office`. It opens browser approval and preserves the existing connection until approval succeeds, then saves a private backup. Have the human check the account and approve the computer. An ordinary `connect` preserves an already valid connection.

If no agents appear in Codex, inspect its hooks. Versions 0.6.0–0.6.1 used a package format whose hooks were silently ignored by Codex 0.161/0.162-alpha; update the plugin to 0.6.2 or later. Have the human open Codex **Settings → Hooks**, select **sidequest-office**, review its entries, then start a new task. The CLI equivalent is `/hooks`. A popup is not guaranteed. Host hook trust is reviewed in the coding client; never edit its trust settings to bypass that review.

If Node is unavailable, explain that Node.js 22.18+ must be on the coding client's PATH. If the helper reports a broken saved configuration, use `doctor` and report its error; don't delete or overwrite the file. On SSH, WSL, containers or another computer, connect in that environment and use the returned browser link.

Keep configuration files, device secrets and ingest keys private. Read only helper output for routine setup. Never ask the user to paste a token, download a configuration file or clone the product repository for this flow.
