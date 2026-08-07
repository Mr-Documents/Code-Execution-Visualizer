/**
 * Prepares the built Vite `index.html` for use inside a VS Code webview.
 *
 * Kept free of the `vscode` module so it can be unit tested directly.
 */

/**
 * Rewrites the page's root-relative asset URLs to webview URIs and applies a
 * restrictive Content Security Policy.
 *
 * @param rawHtml      Contents of the built index.html.
 * @param assetBaseUri Webview URI of the directory the assets live in, no trailing slash.
 * @param cspSource    The webview's `cspSource`, the only origin allowed to serve code.
 */
export function buildWebviewHtml(rawHtml: string, assetBaseUri: string, cspSource: string): string {
    let html = rawHtml;

    // Vite emits absolute paths (`/assets/...`, `/favicon.svg`) that resolve to
    // nothing under the webview's origin. Rewrite every root-relative href/src.
    // The `(?!\/)` guard keeps protocol-relative URLs (`//host/x`) intact.
    html = html.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_match, attr, rest) =>
        `${attr}="${assetBaseUri}/${rest}"`
    );

    // These resources are same-origin for the webview; requesting them in CORS
    // mode buys nothing and can fail depending on how VS Code serves them.
    html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');

    const csp = [
        "default-src 'none'",
        `img-src ${cspSource} data:`,
        // React and the graph library attach styles inline at runtime.
        `style-src ${cspSource} 'unsafe-inline'`,
        `script-src ${cspSource}`,
        `font-src ${cspSource}`
    ].join('; ');
    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>\n    ${meta}`);
    }
    return `${meta}\n${html}`;
}
