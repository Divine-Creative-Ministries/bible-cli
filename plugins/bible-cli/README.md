# Bible CLI plugin

This plugin connects your AI client to the hosted Bible CLI MCP server and adds a
`bible-study` skill. The server has 25 read-only tools over four English
translations, tagged Hebrew and Greek with morphology and clause syntax, lexicons,
cross-references, and computed quotation links.

To install it in a Claude Code session, run:

```text
/plugin install bible-cli --marketplace Divine-Creative-Ministries/bible-cli
```

Setup steps for every client are in the
[main README](https://github.com/Divine-Creative-Ministries/bible-cli#connect-an-ai-app).

## What the plugin sends

Installing the plugin downloads it from GitHub. After that, its only network call
is to `https://mcp.biblecli.org/mcp`, which receives the arguments of each tool
call, such as a reference or search term.

The plugin has no telemetry and uses no accounts or credentials. It has no hooks
or scripts, and it runs no server on your machine.

The server's code does not store tool arguments or results. Railway, which hosts
the server, keeps HTTP request logs that include IP address, user agent, path,
timing, and status code.

## Links

- [Privacy policy](https://biblecli.org/privacy/)
- [Terms](https://biblecli.org/terms/)
- [Support](https://biblecli.org/support/)
- [Data sources and licenses](https://github.com/Divine-Creative-Ministries/bible-cli/blob/main/docs/DATA-SOURCES.md)

The plugin code is under the MIT License. See [LICENSE](LICENSE).
