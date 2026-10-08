---
name: connect-tinyagents
description: Connect this coding client to the user's tinyAGENTS office, retry an unfinished browser connection, or diagnose why its agents are missing.
---

Connect the installed plugin with its bundled helper. Resolve `../../scripts/office.mjs` relative to this SKILL.md's directory, quote the absolute path, and run it with Node:

```text
node <absolute-plugin-path>/scripts/office.mjs connect
```

The helper opens the browser and returns a public connection link. Show that link if approval is pending. The human signs in with GitHub or GitLab and approves their computer there. The helper saves its credential automatically; Codex and Claude Code in the same OS account share it. Preserve existing connections.

After the human completes approval, run the same helper with `doctor`. Only report connection success when credentials are accepted. If no agents appear, check that the plugin's hooks are enabled and trusted, then ask the human to start a new task. Host hook trust is reviewed in the coding client; never edit its trust settings to bypass that review.

If Node is unavailable, explain that Node.js 22.18+ must be on the coding client's PATH. If the helper reports a broken saved configuration, use `doctor` and report its error; don't delete or overwrite the file. On SSH, WSL, containers or another computer, connect in that environment and use the returned browser link.

Keep configuration files, device secrets and ingest keys private. Read only helper output for routine setup. Never ask the user to paste a token, download a configuration file or clone the product repository for this flow.
