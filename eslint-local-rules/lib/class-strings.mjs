/**
 * eslint-local-rules/lib/class-strings.mjs
 *
 * Locates Tailwind class strings in a JS/TS AST **without ever looking at
 * source text**.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * A previous P4 regression shipped because an English word in a code *comment*
 * was scanned for Tailwind class names and a utility-shaped token was treated
 * as a candidate. Tailwind then emitted a dead elevation rule into the
 * production bundle. Comments are not AST nodes: they live only in the token
 * stream between nodes, so a rule that reads nothing but node *values* can never
 * see them. That is the whole design: every extraction path below reads
 * `Literal.value` or `TemplateElement.value.cooked` and nothing else, and the
 * walk uses `sourceCode.visitorKeys` so it cannot stray into a neighbouring
 * comment or into `node.parent`.
 *
 * The five places a class string lives in this codebase:
 *   1. <div className="…">                      -> Literal
 *   2. <div className={`a ${x} b`}>             -> TemplateLiteral quasis
 *   3. <div className={cn("a", x && "b")}>      -> class-composer call args
 *   4. cva("base", { … }) / clsx("…")           -> class-composer call args
 *   5. const inputClass = "…";                  -> *Class module constant
 *
 * A string literal that is NOT in one of those positions is never inspected, so
 * prose in a variable, a translation table, or a `title` attribute is ignored.
 *
 * ── Why this file names no utility token ───────────────────────────────────
 * Tailwind scans every un-ignored file in the repo — this one included — for
 * class-shaped candidates, so a contiguous utility literal in a comment here
 * becomes a dead rule in the shipped CSS. Tokens are therefore referred to by
 * role ("the outline-suppression utility") or by their custom-property name
 * (`--radius-control`). `rules.mjs` needs real spellings and assembles them
 * from fragments; see the note above its constants.
 */

/** Helpers whose arguments are class strings. */
const CLASS_COMPOSERS = new Set(["cn", "clsx", "classNames", "cva", "twMerge"]);

/** Module/block constants that hold class strings: `inputClass`, `labelClass`, `…ClassName`. */
const CLASS_CONSTANT_NAME = /class(name)?$/i;

/**
 * HTML tags a user can actually focus. Putting the outline-suppression utility
 * on a Radix `*Content` overlay panel is a harmless convention and must stay
 * silent; putting it on a real `<button>` is the P5 accessibility bug.
 */
const FOCUSABLE_TAGS = new Set([
  "a", "area", "audio", "button", "details", "embed", "iframe",
  "input", "select", "summary", "textarea", "video",
]);

/** ARIA roles that imply the element is an interactive control. */
const INTERACTIVE_ROLES = new Set([
  "button", "checkbox", "combobox", "link", "listbox", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "radio", "searchbox",
  "slider", "spinbutton", "switch", "tab", "textbox", "treeitem",
]);

/**
 * Split a class string into utility tokens **with their offsets**, so a rule can
 * point at the offending token instead of highlighting the whole attribute.
 * Bracket- and paren-aware, so an arbitrary background image, a `calc()` width
 * and a parenthesised custom-property duration each survive as one token.
 *
 * @param {string} text
 * @returns {Array<{token: string, start: number, end: number}>} offsets into `text`
 */
export function splitClasses(text) {
  const tokens = [];
  let buffer = "";
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      buffer += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
      continue;
    }
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth = Math.max(0, depth - 1);

    if (/\s/.test(char) && depth === 0) {
      if (buffer) tokens.push({ token: buffer, start, end: i });
      buffer = "";
      start = i + 1;
      continue;
    }
    buffer += char;
  }
  if (buffer) tokens.push({ token: buffer, start, end: text.length });
  return tokens;
}

/**
 * Strip Tailwind variant prefixes so a hover, data or child-selector variant all
 * reduce to the same bare utility.
 * Bracket-aware, so a colon inside an arbitrary URL value is not mistaken for one.
 */
export function utilityOf(classToken) {
  let depth = 0;
  for (let i = classToken.length - 1; i >= 0; i--) {
    const char = classToken[i];
    if (char === "]" || char === ")") depth++;
    else if (char === "[" || char === "(") depth--;
    else if (char === ":" && depth === 0) return classToken.slice(i + 1);
  }
  return classToken;
}

function attributeName(attribute) {
  return attribute.type === "JSXAttribute" && attribute.name?.type === "JSXIdentifier"
    ? attribute.name.name
    : null;
}

/**
 * Marker for a class string that has no JSX element context at all — a
 * `const inputClass = "…"` module constant or a `cva()` base. Distinct from
 * `undefined`, which means "a capitalised component, unresolvable here".
 */
export const NO_ELEMENT = Symbol("aether-theme/no-element");

/**
 * Decide whether a JSX element is an interactive control, so the
 * outline-suppression utility can be flagged on real controls without flagging
 * non-focusable overlay panels.
 *
 * Returns true/false when the element is decidable, or `undefined` when it is a
 * capitalised component (resolving what that renders needs the type checker).
 */
export function jsxElementInteractivity(openingElement) {
  const name = openingElement?.name;
  if (!name || name.type !== "JSXIdentifier") return undefined;

  const attrs = openingElement.attributes ?? [];
  const roleValue = attrs.find((a) => attributeName(a) === "role")?.value?.value;
  if (typeof roleValue === "string" && INTERACTIVE_ROLES.has(roleValue.toLowerCase())) return true;
  if (attrs.some((a) => attributeName(a) === "tabIndex")) return true;

  if (/^[A-Z]/.test(name.name)) return undefined;
  return FOCUSABLE_TAGS.has(name.name.toLowerCase());
}

function isClassComposerCall(node) {
  return node.type === "CallExpression"
    && node.callee.type === "Identifier"
    && CLASS_COMPOSERS.has(node.callee.name);
}

function collectFromExpression(node, out) {
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, text: node.value });
      return;
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        out.push({ node: quasi, text: quasi.value.cooked ?? quasi.value.raw });
      }
      return;
    case "ConditionalExpression":
      collectFromExpression(node.consequent, out);
      collectFromExpression(node.alternate, out);
      return;
    case "LogicalExpression":
      collectFromExpression(node.left, out);
      collectFromExpression(node.right, out);
      return;
    case "SequenceExpression":
      for (const expr of node.expressions) collectFromExpression(expr, out);
      return;
    case "CallExpression":
      if (isClassComposerCall(node)) {
        for (const arg of node.arguments) collectFromExpression(arg, out);
      }
      return;
    case "ArrayExpression":
      for (const element of node.elements) if (element) collectFromExpression(element, out);
      return;
    case "ObjectExpression":
      for (const property of node.properties) {
        if (property.type === "Property") collectFromExpression(property.value, out);
      }
      return;
    default:
  }
}

/**
 * @param {object} program    AST root
 * @param {object} visitorKeys `sourceCode.visitorKeys`
 * @returns {Array<{node: object, text: string, interactivity: boolean|undefined|symbol}>}
 *   `interactivity` is true/false for a decidable JSX element, `undefined` for a
 *   capitalised component, and `NO_ELEMENT` for a `*Class` constant or a
 *   `cva()` base with no element.
 */
export function collectClassStrings(program, visitorKeys) {
  const found = [];

  const pushWithElement = (expression, openingElement) => {
    const parts = [];
    collectFromExpression(expression, parts);
    if (parts.length === 0) return;
    const interactivity = openingElement
      ? jsxElementInteractivity(openingElement)
      : NO_ELEMENT;
    for (const part of parts) found.push({ ...part, interactivity });
  };

  const visit = (node) => {
    if (node == null || typeof node.type !== "string") return;

    if (node.type === "JSXAttribute" && attributeName(node) === "className" && node.value) {
      // <div className="…"> | <div className={…}>
      const openingElement = node.parent?.parent?.openingElement;
      const expression = node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      pushWithElement(expression, openingElement);
      return; // handled in full; do not descend a second time
    }

    if (node.type === "VariableDeclarator"
      && node.id?.type === "Identifier"
      && CLASS_CONSTANT_NAME.test(node.id.name)
      && node.init) {
      pushWithElement(node.init, null);
      return;
    }

    // A class composer that is not the direct value of a className, e.g. the
    // shared `const dialogVariants = cva("…")` module constant.
    if (isClassComposerCall(node)) pushWithElement(node, null);

    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  };

  visit(program);
  return found;
}

/**
 * Should the outline-suppression utility be treated as a bug here?
 *
 *   true      -> a real control (`<input>`, `<button>`, `role="button"`, tabIndex)
 *   NO_ELEMENT -> a `*Class` constant / `cva()` base. Those hold *control*
 *                styling in this codebase — a `const inputClass` whose value
 *                opens with the outline-suppression utility is the exact shape
 *                that carried the P5 gap — so unknown means interactive. A
 *                genuinely decorative element-less constant would need an
 *                eslint-disable with a reason, which is the right friction.
 *   undefined -> a capitalised component this rule cannot resolve. Exempt:
 *                the Radix dialog/popover content panels are legitimate users of
 *                the pattern (the panel is not focusable, and Radix moves focus
 *                into it programmatically).
 *   false     -> a plain non-focusable element such as `<div>` or `<li>`.
 */
export function isInteractiveContext(interactivity) {
  return interactivity === true || interactivity === NO_ELEMENT;
}

/**
 * How far into `node.range` the class string's own text begins: past the
 * opening quote on a `Literal`, past the delimiter on a `TemplateElement`.
 * Pure position arithmetic — it never reads a character of source text.
 */
export function contentOffset(node) {
  if (node.type === "Literal") {
    const quote = node.raw?.charCodeAt(0);
    return quote === 34 || quote === 39 ? 1 : 0;
  }
  return 1;
}