# AgentStackd MCP server

A free, read-only MCP server for searching and comparing the 77 hand-reviewed AI agents and tools listed on [AgentStackd](https://agentstackd.com). No API key.

**Remote URL:** https://agentstackd.com/api/mcp

Streamable HTTP, MCP protocol `2025-06-18`. Listed on the official MCP Registry as `com.agentstackd/directory` v0.1.0.

Setup walkthrough: [agentstackd.com/mcp/](https://agentstackd.com/mcp/)

## Tools

**search_tools** — Search the directory by keyword, with optional category and pricing filters. Returns matching tools with pricing model, description and the agentstackd.com page URL.

Arguments:

- `query` (string, required) — Keywords, e.g. `"coding agent"`, `"web research"`, `"self-hosted automation"`.
- `category` (string, optional) — A category slug from `list_categories`. Current slugs: `coding`, `research`, `sales`, `support`, `content`, `assistants`, `automation`.
- `max_price` (string, optional) — Pricing ceiling: `free` (Free or Open source only), `freemium` (also tools with a free plan), or `paid` (everything). The directory records pricing models, not dollar amounts.
- `limit` (integer, optional) — Max results, 1–25 (default 10).

**get_tool** — Get one tool's listing: pricing model, description, pros, limitations, vendor sources (with the date they were checked), related comparisons and the agentstackd.com page URL. Looks up a slug or name with case-insensitive, prefix and substring matching (for example `"Copilot"`, `"Codex"` or `"Apollo"`). If nothing matches, the error includes "did you mean" suggestions for the closest listed tools.

Arguments:

- `slug` (string, required) — Tool slug or name (e.g. `"cursor"`, `"claude-code"`, `"Copilot"`). Partial names are OK.

**compare_tools** — Compare 2 or 3 tools side by side: category, pricing model, pros, limitations and sources, plus any AgentStackd head-to-head comparison page that covers them. Partial names are OK. If some names are not in the directory, the tools that were found are still returned, along with a `not_listed` array of the missing queries and any "did you mean" suggestions. The call only errors if none of the names are listed.

Arguments:

- `slugs` (array of 2 or 3 strings, required) — Tool slugs or names, e.g. `["Cursor", "Windsurf", "Claude Code"]`.

**list_categories** — Categories with descriptions, tool counts and page URLs. No arguments.

**new_releases** — Recently released AI tools added to AgentStackd, with the vendor's release date and page URL. No arguments.

Every result includes the agentstackd.com page URL.

## Connect

### Claude Desktop

Custom connectors work on Claude and Claude Desktop for Free, Pro, Max, Ultra, Team and Enterprise plans (Free is limited to one). Go to Customize → Connectors, click + Add, then Add custom connector, and paste the endpoint URL:

```
https://agentstackd.com/api/mcp
```

Alternatively, add this to `claude_desktop_config.json` (needs Node.js for `mcp-remote`):

```json
{
  "mcpServers": {
    "agentstackd": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://agentstackd.com/api/mcp"
      ]
    }
  }
}
```

### Cursor

Add this to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "agentstackd": {
      "url": "https://agentstackd.com/api/mcp"
    }
  }
}
```

### VS Code

Current VS Code docs put this in `.mcp.json` at your workspace root, or in `~/.copilot/mcp-config.json` for all workspaces. Both use a top-level `mcpServers` key. You can also use Chat: Open Customizations → MCP Servers → Add Server, choose HTTP, and paste the endpoint URL:

```json
{
  "mcpServers": {
    "agentstackd": {
      "type": "http",
      "url": "https://agentstackd.com/api/mcp"
    }
  }
}
```

If you still use the older editor-managed file `.vscode/mcp.json` (the Local harness, deprecated and scheduled for removal in February 2027), the same server goes under a top-level `servers` key:

```json
{
  "servers": {
    "agentstackd": {
      "type": "http",
      "url": "https://agentstackd.com/api/mcp"
    }
  }
}
```

## Example prompts

Once connected, you can ask things like:

- Search AgentStackd for free coding agents.
- What's the pricing model and limitations of Cursor?
- Compare Claude Code and OpenAI Codex.
- Get the listing for Copilot.
- What categories does AgentStackd cover?
- Which tools were added recently?

## Rate limits and access

Free, no API key, read-only. No login and no writes; we don't store your queries. Requests are rate limited to 60 per minute per IP.

## This repository

`api/mcp.js` is the live server (a Vercel Node function). It reads `api/_lib/data.json`, a snapshot of the public listing data generated when [agentstackd.com](https://agentstackd.com) is built. The live dataset may be newer than the snapshot in this repo.

`server.json` is the MCP Registry server description.

## License

MIT. See [LICENSE](LICENSE).
