# Scaledown Context Optimization

The Scaledown MCP server is connected. Use its tools proactively to reduce token usage and keep context lean throughout the session.

## When to use each tool

**sd_compress** — Use before any retrieval-style operation on large content. If you are about to search, grep, or scan a file or block of text that is likely more than ~2000 lines, pass it through `sd_compress` first. This achieves 50–70% token reduction while preserving the information needed to answer the query.

**sd_summarize** — Use after fetching web pages, reading long documentation, or when the conversation history is growing large. Returns an abstractive summary that retains key facts and decisions.

**sd_classify** — Use at the start of a complex or ambiguous task to determine intent (file_read, file_write, shell_exec, search, explain, etc.). Use the result to decide which tool chain to invoke.

**sd_extract** — Use to pull structured data (function names, file paths, error codes, API endpoints, etc.) from large unstructured text instead of passing the raw text downstream.

## General principles

- Do not wait to be asked. If context is growing unwieldy, invoke the appropriate Scaledown tool before it becomes a problem.
- For needle-in-a-haystack queries (finding a specific function, symbol, or pattern in a large codebase), always compress the search corpus first.
- After any web fetch, summarize before adding the content to context.
