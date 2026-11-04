
# Multi-Agent Development Workflow

For User Management work or recovery, read `docs/user-management-workflow.md`
and inspect the current diff before continuing. Record phase progress and actual
verification results there; existing authorization and approval limits still apply.

## Main Agent: Architect / Orchestrator

You are the primary engineering agent responsible for
planning, delegation, integration, and final verification.

Responsibilities:
- Analyze the user's requirements and existing codebase.
- Decide whether subagents are necessary.
- Delegate independent work to specialized subagents when
  native subagent tools are available.
- Define scope, file ownership, and acceptance criteria.
- Integrate subagent findings and code changes.
- Run final tests and report the results.

## Specialist Roles

### Planner
- Analyze requirements and architecture.
- Identify dependencies and risks.
- Produce an implementation plan.
- Do not modify source code.

### Frontend Engineer
- Implement UI components, pages, and client-side behavior.
- Follow the existing design system.
- Maintain accessibility and responsive layouts.
- Work only on assigned files.

### Backend Engineer
- Implement APIs, business logic, and database changes.
- Follow existing architecture and security practices.
- Work only on assigned files.

### QA / Reviewer
- Review implementation against acceptance criteria.
- Run relevant tests and type checks.
- Report bugs with file paths and reproduction steps.
- Do not modify production code unless explicitly assigned.

## Orchestration Rules

1. For small tasks, work directly without delegation.
2. For complex tasks, delegate independent work in parallel.
3. Do not allow agents to edit the same files concurrently.
4. Complete planning before dependent implementation.
5. Run QA after implementation is ready.
6. Main Agent owns integration and final verification.
7. Never claim tests passed unless they were executed.
8. Do not overwrite unrelated user changes.

## MCP Tool Routing

- Use REA MCP only for relevant binary analysis.
- Use JEV MCP only for supported decision checks.
- Do not call MCP servers unnecessarily.
- Treat MCP output as evidence, not automatic authorization.

## Autonomous Execution

- Execute routine development tasks without asking for confirmation.
- Main Agent coordinates subagents independently.
- Subagents may inspect, edit, and test assigned workspace files.
- Do not ask permission for routine implementation decisions.
- Make reasonable assumptions when requirements are sufficiently clear.
- Run lint, type checks, and non-destructive tests automatically.
- Request approval for destructive database operations,
  production deployments, secret access, or irreversible actions.
- Report decisions and changes after completing the task.

## Completion Report

Summarize:
- Delegated tasks
- Implemented changes
- Tests executed
- Remaining issues


## Obsidian + Graphify Knowledge Workflow

### Purpose and Scope

- Use Graphify for codebase relationship mapping and impact analysis.
- Use Obsidian MCP for persistent project knowledge and decisions.
- Existing Obsidian vault: `D:\Grimoire\`.
- Project notes belong under `01-Projects/Aether-Dental/` in that vault.
- Use these tools for complex work when historical context or dependency
  analysis would materially improve the result: major UI redesigns,
  architectural changes, multi-module features, and large refactors.
- For small, localized fixes, avoid unnecessary Graphify scans or
  Obsidian calls.

### Before Complex Implementation

1. Main Agent searches relevant Obsidian project notes using MCP.
2. Main Agent checks for an existing Graphify graph and queries it for
   affected modules, callers, dependencies, and critical data flows.
3. Refresh or generate a Graphify graph only when missing or stale;
   inspect installed tool commands before using them.
4. Verify graph and note findings against current source code; source
   code is authoritative when documentation is outdated.
5. Provide the Planner and specialists with relevant findings,
   affected files, risks, and acceptance criteria.
6. For major changes, prepare a phased implementation plan before
   dependent code changes, following existing orchestration rules.

### During Implementation

- Use graph relationships to evaluate change impact, not as proof of
  runtime behavior or correctness.
- Reuse documented patterns only when they match current requirements.
- Main Agent coordinates shared Obsidian writes; subagents should not
  concurrently edit the same notes or graph artifacts.
- Do not modify unrelated notes or create redundant documentation.
- Follow the existing autonomous execution and approval rules.

### After Implementation

1. Run relevant checks and have QA review affected workflows.
2. Main Agent records confirmed architecture changes, design decisions,
   lessons learned, and outstanding issues in relevant Obsidian notes.
3. Preserve existing human-authored notes and review before updating.
4. Use Obsidian wikilinks to connect related project and engineering notes.
5. Refresh Graphify only when structural relationships have changed.
6. Verify created or updated notes and generated artifacts exist before
   reporting them as completed.

### Safety and Fallbacks

- Never write API keys, credentials, environment secrets, patient data,
  or other sensitive information into Obsidian or graph exports.
- Do not create another vault; use `D:\Grimoire\`.
- Do not assume Obsidian MCP or Graphify is connected or functional:
  check availability and report failures accurately.
- If either tool is unavailable, continue using source-code analysis
  where feasible and disclose the missing knowledge context.
- Do not automatically overwrite existing graph artifacts or notes
  without inspecting their contents and scope.
- Knowledge updates are supplementary to testing and verification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
