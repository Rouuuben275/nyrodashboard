import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const findings = [], controls = {};
function visitDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { visitDirectory(file); continue; }
    if (!file.endsWith(".tsx")) continue;
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function inspect(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(tree);
        if (tag.startsWith("RPilot")) controls[tag] = (controls[tag] || 0) + 1;
        const attrs = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(tree), a.initializer?.getText(tree).replaceAll('"', '')]));
        const primitive = file.split(path.sep).includes("ui");
        if (!primitive && (tag === "select" || tag === "datalist" || tag === "textarea" || tag === "input" && ["date", "time", "datetime-local", "checkbox", "radio", "file", "color", "number"].includes(attrs.type))) findings.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, problem: `Raw control: ${tag} ${attrs.type || ""}` });
        if (["button", "a", "input", "span", "div"].includes(tag) && attrs.title) findings.push({ file, problem: "Native title tooltip" });
      }
      if (ts.isCallExpression(node) && /^(window\.)?(alert|confirm|prompt)$/.test(node.expression.getText(tree))) findings.push({ file, problem: "Native blocking dialog" });
      ts.forEachChild(node, inspect);
    }
    inspect(tree);
  }
}
visitDirectory("src");
console.log(JSON.stringify({ findings, controls }, null, 2));
if (findings.length) process.exitCode = 1;
