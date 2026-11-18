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

**get_tool** — Get one tool's listing: pricing model, description, pros, limitations, vendor sources (with the date they were checked), related comparisons and the agentstackd.com page URL.

Arguments:

- `slug` (string, required) — Tool slug (e.g. `"cursor"`, `"claude-code"`) or exact tool name.

**compare_tools** — Compare 2 or 3 tools side by side: category, pricing model, pros, limitations and sources, plus any AgentStackd head-to-head comparison page that covers them.

Arguments:

- `slugs` (array of 2 or 3 strings, required) — Tool slugs or names, e.g. `["claude-code", "openai-codex"]`.

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

Add this to `.mcp.json` at your workspace root, or to `~/.copilot/mcp-config.json` for all workspaces. You can also use Chat: Open Customizations → MCP Servers → Add Server, choose HTTP, and paste the endpoint URL:

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

## Example prompts

Once connected, you can ask things like:

- Search AgentStackd for free coding agents.
- What's the pricing model and limitations of Cursor?
- Compare Claude Code and OpenAI Codex.
- What categories does AgentStackd cover?
- Which tools were added recently?

## Rate limits and access

Free, no API key, read-only. No login and no writes; we don't store your queries. Requests are rate limited to 60 per minute per IP.

## This repository

`api/mcp.js` is the live server (a Vercel Node function). It reads `api/_lib/data.json`, a snapshot of the public listing data generated when [agentstackd.com](https://agentstackd.com) is built. The live dataset may be newer than the snapshot in this repo.

`server.json` is the MCP Registry server description.

## License

MIT. See [LICENSE](LICENSE).
