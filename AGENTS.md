# Code organization and readability

- Keep changes readable and well structured. Do not cram unrelated behavior
  into an existing file just to avoid creating a new one.
- Prefer focused modules. When a change introduces a distinct responsibility,
  create a suitable file, import it from the caller, and keep the public
  boundary clear.
- Use concise, descriptive file and directory names: normally one or two
  meaningful words that describe the code's responsibility.
- Organize files into clear, responsibility-based folder paths. A file's path
  should make its purpose and owning feature understandable without opening
  it; avoid vague catch-all folders such as `misc`, `helpers`, or `utils` when
  a feature or domain folder is more precise.
- Keep related code together beneath its feature or domain folder, and place
  shared code only in a clearly named shared folder when it is genuinely used
  across multiple features.
- Keep every source-code file at 1,000 lines or fewer. Before a change would
  exceed that limit, extract cohesive code into one or more appropriately
  named modules. Do not split a file arbitrarily; group code by responsibility.
- When editing an already oversized file, avoid adding more unrelated code to
  it. Extract the changed or adjacent responsibility when practical, without
  making a risky unrelated rewrite.
- Add comments for non-obvious intent, constraints, tradeoffs, and safety
  decisions. Do not add comments that merely restate what clear code says.
- Keep functions and components focused, use clear names, and prefer explicit
  data flow over tightly coupled implementation details.
