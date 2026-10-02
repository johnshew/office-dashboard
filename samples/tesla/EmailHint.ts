export function consumeEmailHint(): string | undefined {
    const fragment = new URL(window.location.href).hash;
    const params = new URLSearchParams(fragment.slice(1));
    // Never consume Microsoft's authorization response or unrelated fragments.
    if (!params.has('email') || Array.from(params.keys()).some(key => key !== 'email')) return undefined;
    const value = params.getAll('email').length === 1 ? params.get('email') : '';
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url.href);
    return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : undefined;
}
