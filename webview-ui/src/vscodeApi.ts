/** Handle to the VS Code webview host. */
interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | undefined;

/**
 * Returns the webview host API.
 *
 * `acquireVsCodeApi` may only be called once per webview, so the handle is
 * memoized. Outside a webview (unit tests, `vite dev`) it isn't defined at all,
 * in which case posting is a no-op.
 */
export function getVsCodeApi(): VsCodeApi {
  if (!cached) {
    cached = typeof acquireVsCodeApi === 'function'
      ? acquireVsCodeApi()
      : { postMessage: () => {} };
  }
  return cached;
}
