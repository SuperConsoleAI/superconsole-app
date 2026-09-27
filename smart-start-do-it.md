Yes — but there is an important distinction:

**You cannot realistically force Claude Code or Codex themselves to have only 100–500 startup tokens if their harness injects thousands of tokens.** You can, however, redesign the agent architecture so the **first model request** is ~100–500 tokens by keeping tools/context out of the initial request and loading them only when needed.

### The architecture you want

Instead of:

```text
START
 ↓
System prompt
+ 40 tool schemas
+ MCP schemas
+ project instructions
+ workspace context
 ↓
MODEL
 ↓
13K–50K tokens
```

use:

```text
START
 ↓
Tiny system prompt
+ tiny tool-discovery tool
+ "hi"
 ↓
MODEL
 ↓
~100–500 tokens
```

Then:

```text
User: "find the auth bug"
        ↓
Agent discovers relevant tools
        ↓
Load only:
  read_file
  grep
  git_diff
        ↓
Next model request
```

OpenAI **officially supports this architecture now** through Tool Search / deferred tools: tools marked `defer_loading: true` aren't loaded into the model's initial context; the model searches for and loads definitions when needed. OpenAI explicitly says this can reduce token usage and cost. ([OpenAI Developers][1])

### For Codex

If you're building your **own Codex-based agent**, this is the biggest lever.

Don't put:

```text
40 tool definitions
```

into every initial request.

Use:

```text
tool_search
├── defer_loading: true
│
├── bash
├── git
├── read_file
├── edit_file
├── grep
├── glob
├── patch
└── ...
```

Then only expose the relevant definitions after discovery.

OpenAI specifically documents that deferred tools are loaded dynamically and injected at the end of context. ([OpenAI Developers][1])

**That is basically the architecture you're imagining for Antigravity.**

### For Claude

Claude's API also supports tool use, but if you're talking about **Claude Code itself**, you don't have the same level of control over its internal startup harness.

You can reduce what you control:

```text
~/.claude/
CLAUDE.md
MCP servers
plugins
skills
hooks
```

The big things to attack are:

1. **Remove unnecessary MCP servers**
2. **Remove unnecessary MCP tools**
3. **Don't expose huge tool descriptions**
4. **Keep CLAUDE.md extremely short**
5. **Don't dump README/project documentation into startup context**
6. **Avoid loading every skill/plugin at startup**
7. **Use tool discovery/lazy loading where the integration supports it**

But you can't simply tell Claude Code:

```text
startup_tokens = 300
```

and make Anthropic's own harness obey it.

### The other huge lever: caching

For Codex/OpenAI, **don't confuse 13K initial context with 13K expensive uncached tokens every turn**.

OpenAI's current documentation says prompt caching includes tool definitions, developer instructions, and conversation context. GPT-5.6+ supports caching, and cached input can cost only **0.1× the uncached input rate**. ([OpenAI Developers][2])

So:

```text
First request
13K input
↓
cache write

Second request
13K context
↓
~13K cached
↓
much cheaper
```

The crucial requirement is to keep the prefix stable. Changing tool definitions, descriptions, ordering, etc. can cause cache misses. ([OpenAI Developers][3])

### If your actual goal is "make my own coding agent"

Then I would **not try to modify Claude Code/Codex**.

I'd build the agent like this:

```text
                  ┌─────────────────┐
                  │  Tiny bootstrap │
                  │    ~200 tokens  │
                  └────────┬────────┘
                           ↓
                    ┌─────────────┐
                    │ Tool Search │
                    └──────┬──────┘
                           ↓
              ┌────────────┴────────────┐
              ↓                         ↓
        filesystem                  terminal
        tools                       tools
              ↓                         ↓
        only load relevant schemas
              └────────────┬────────────┘
                           ↓
                       MODEL
```

And **do not send the entire repository at startup**.

Use:

```text
startup:
  system: ~150 tokens
  tool discovery: ~100 tokens
  user: ~5 tokens

first request ≈ 250 tokens
```

Then progressively load context.

### One correction to your earlier table

I would **not publish**:

> Antigravity = 126 tokens because it uses lightweight dynamic streaming tool registration

as a fact.

Your **126-token observation is valid as an observation**, but the mechanism is not established by that number alone.

The stronger conclusion is:

> **Antigravity's measured initial context is dramatically smaller; its exact mechanism for achieving that is not publicly established.**

And OpenAI's current Tool Search documentation demonstrates that **100–500-token-style startup architecture is technically possible**: defer the large tool schemas and retrieve them only when necessary. ([OpenAI Developers][1])

If you're building **your own Claude/GPT coding CLI**, I can give you the exact architecture/config to get the **first request under ~500 tokens while still having 30–50 tools available**.

[1]: https://developers.openai.com/api/docs/guides/tools-tool-search?utm_source=chatgpt.com "Tool search | OpenAI API"
[2]: https://developers.openai.com/api/docs/guides/prompt-caching?utm_source=chatgpt.com "Prompt caching | OpenAI API"
[3]: https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics?utm_source=chatgpt.com "Prompt cache diagnostics | OpenAI API"
