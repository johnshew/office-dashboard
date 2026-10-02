// Chromium 88 has AbortController, but not AbortSignal.timeout.
export async function fetchWithTimeout<T>(input: RequestInfo | URL, options: RequestInit, timeout: number,
    consume: (response: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(input, { ...options, signal: controller.signal });
        return await consume(response);
    } finally { clearTimeout(timer); }
}
