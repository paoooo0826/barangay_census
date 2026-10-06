// Temporary mitigation for GHSA-vfj7-8cjw-p6xm (upstream has no patched
// release). Applied on npm ci/install; does not pretend the audit is clean.
const fs = require("node:fs");
const path = require("node:path");
const marker = "census-braces-depth-guard";
const guard = `'use strict';
module.exports = function guard(root) {
  const queue = [[root, 0]];
  const seen = new Set();
  let count = 0;
  while (queue.length) {
    const [node, depth] = queue.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || ++count > 65536 || seen.has(node)) {
      throw new SyntaxError('Brace pattern exceeds safe nesting limits');
    }
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) queue.push([child, depth + 1]);
    }
  }
};\n`;

function patch(root) {
  const version = JSON.parse(
    fs.readFileSync(path.join(root, "package.json")),
  ).version;
  if (version !== "3.0.3")
    throw new Error(`Review braces mitigation for version ${version}`);
  const edits = [
    [
      "parse.js",
      "  while (index < length) {",
      `  // ${marker}\n  while (index < length) {\n    if (stack.length > 128) throw new SyntaxError('Brace pattern exceeds safe nesting limits');`,
    ],
    [
      "compile.js",
      "const compile = (ast, options = {}) => {",
      `const compile = (ast, options = {}) => {\n  // ${marker}\n  require('./census-depth-guard')(ast);`,
    ],
    [
      "expand.js",
      "const expand = (ast, options = {}) => {",
      `const expand = (ast, options = {}) => {\n  // ${marker}\n  require('./census-depth-guard')(ast);`,
    ],
    [
      "stringify.js",
      "module.exports = (ast, options = {}) => {",
      `module.exports = (ast, options = {}) => {\n  // ${marker}\n  require('./census-depth-guard')(ast);`,
    ],
  ];
  // Check all source boundaries before changing any file.
  const sources = edits.map(([file, needle, replacement]) => {
    const filename = path.join(root, "lib", file);
    const source = fs.readFileSync(filename, "utf8");
    if (!source.includes(marker) && !source.includes(needle))
      throw new Error(`Unexpected braces source: ${file}`);
    return [
      filename,
      source.includes(marker) ? source : source.replace(needle, replacement),
    ];
  });
  fs.writeFileSync(path.join(root, "lib", "census-depth-guard.js"), guard);
  for (const [filename, source] of sources) fs.writeFileSync(filename, source);
}

function visit(modules) {
  if (!fs.existsSync(modules)) return;
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const root = path.join(modules, entry.name);
    if (entry.name.startsWith("@")) {
      visit(root);
      continue;
    }
    if (entry.name === "braces") patch(root);
    visit(path.join(root, "node_modules"));
  }
}
visit(path.resolve(__dirname, "../node_modules"));
console.log("Applied braces build-tool nesting guard.");
