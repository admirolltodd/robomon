#!/usr/bin/env node
'use strict';
// Bundles index.html + css + js into one self-contained HTML file.
//   node tools/build.js [out.html]            -> full standalone document (default dist/robomon.html)
//   node tools/build.js out.html --fragment   -> page body only, for hosts that supply their own <html>/<head>
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'dist', 'robomon.html');
const fragment = process.argv.includes('--fragment');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<!-- build:body -->') + 19, html.indexOf('<!-- /build:body -->'));

const inlineHead = head.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) => `<style>\n${read(f)}</style>`);
const inlineBody = body.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => {
  const src = read(f);
  if (src.includes('</script')) throw new Error(`${f} contains a closing script tag`);
  return `<script>\n${src}</script>`;
});

let doc;
if (fragment) {
  const keep = inlineHead.split('\n').filter((l) => /<title>|fonts\.g|<style>/.test(l) || !l.startsWith('<'));
  // The host pads :root by the safe-area insets already.
  doc = `${keep.join('\n')}\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>#app{padding-top:0;padding-bottom:0}</style>\n${inlineBody.trim()}\n`;
} else {
  doc = `<!doctype html>\n<html lang="en">\n<head>${inlineHead}</head>\n<body>${inlineBody}</body>\n</html>\n`;
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, doc);
console.log(`wrote ${out} (${(doc.length / 1024).toFixed(1)} KB)`);
