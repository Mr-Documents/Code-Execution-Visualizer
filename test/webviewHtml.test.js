const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWebviewHtml } = require('../src/core/webviewHtml.ts');

const BASE = 'https://file%2B.vscode-resource.vscode-cdn.net/ext/webview-ui/dist';
const CSP_SOURCE = 'https://file%2B.vscode-resource.vscode-cdn.net';

// Mirrors what Vite actually emits, including the root-relative favicon and the
// crossorigin attributes.
const VITE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>webview-ui</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-def.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

test('rewrites every root-relative asset path to the webview base', () => {
  const html = buildWebviewHtml(VITE_HTML, BASE, CSP_SOURCE);

  assert.ok(html.includes(`src="${BASE}/assets/index-abc.js"`));
  assert.ok(html.includes(`href="${BASE}/assets/index-def.css"`));
  // Regression: the favicon is root-relative too and used to be left behind.
  assert.ok(html.includes(`href="${BASE}/favicon.svg"`));
  assert.ok(!/(href|src)="\//.test(html), 'no root-relative URLs should remain');
});

test('injects a CSP that only trusts the webview source', () => {
  const html = buildWebviewHtml(VITE_HTML, BASE, CSP_SOURCE);

  assert.ok(html.includes('http-equiv="Content-Security-Policy"'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes(`script-src ${CSP_SOURCE}`));
  // Inline styles are required by React and the graph library.
  assert.ok(html.includes(`style-src ${CSP_SOURCE} 'unsafe-inline'`));
  // The CSP must be inside <head> to apply.
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('</head>'));
});

test('strips crossorigin from webview-local resources', () => {
  const html = buildWebviewHtml(VITE_HTML, BASE, CSP_SOURCE);
  assert.ok(!html.includes('crossorigin'));
});

test('still produces a CSP when the document has no head', () => {
  const html = buildWebviewHtml('<div id="root"></div>', BASE, CSP_SOURCE);
  assert.ok(html.includes('Content-Security-Policy'));
});

test('leaves absolute and protocol-relative URLs untouched', () => {
  const input = '<head><img src="https://example.com/a.png"><a href="//cdn/x.js"></a></head>';
  const html = buildWebviewHtml(input, BASE, CSP_SOURCE);

  assert.ok(html.includes('src="https://example.com/a.png"'));
  assert.ok(html.includes('href="//cdn/x.js"'));
});
