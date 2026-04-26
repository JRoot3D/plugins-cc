# Escape-hatch lists by language

Reference data used by `/teams:init` when filling the `{{ESCAPE_HATCH_LIST}}` placeholder in `rules-templates/reviewer.md`. Pick the section matching the project's `language` from `.flow-spec/project.md` and render its bullets verbatim into the template.

If `static_typing: no` in `project.md`, render the entire bullet (the `must-fix` line about escape hatches and its sub-bullet) as: `(skipped — static_typing: no)`.

---

## TypeScript
- `any`
- `unknown` when a narrower type would do
- `as any`
- `// @ts-ignore`
- `// @ts-expect-error` without an issue link
- non-null assertion `!`

## JavaScript
- untyped function parameters where JSDoc is available
- `eval`
- `Function(…)` constructor

## Python
- `typing.Any`
- `cast(Any, …)`
- `# type: ignore` without a reason
- untyped `**kwargs` on public APIs

## Rust
- `unsafe`
- `unwrap()`
- `expect("…")` outside test/init code
- `Box<dyn Any>`

## Go
- `interface{}` / `any`
- `panic` outside `init` / fatal paths
- type assertions without the `, ok` form

## Java / Kotlin
- raw types
- `Object` parameters
- `!!` (Kotlin)
- `@Suppress("UNCHECKED_CAST")` without a reason

## C#
- `dynamic`
- `object` parameters
- `#pragma warning disable` without a reason

## Swift
- `Any`
- force-unwrap `!`
- `try!`
- `as!`

## Ruby
- `T.untyped` (Sorbet)
- `rescue` without a class

## PHP
- `mixed` (PHP 8+) on public APIs
- `@phpstan-ignore-next-line` without a reason

## Dart
- `dynamic`
- `late` without justification
- force-unwrap `!`

## Elixir
- `Code.eval_string`
- `apply/3` with untyped module references on hot paths

## Plain shell / unknown
(no static typing — section skipped)
