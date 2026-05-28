/**
 * Wait `ms` milliseconds, but reject early (with `AbortError`) if `signal`
 * fires while we're sleeping. Without this, a Cancel during the 3-second
 * inter-poll wait would do nothing — the controller would only hit the
 * next `fetch` ~3 seconds later.
 */
export function sleepCancellable(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
