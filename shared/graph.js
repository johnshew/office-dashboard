// Shared by the optional Node service and Phone Link Worker.
export function graphUrl(path, createError = message => {
        const error = new Error(message);
        error.status = 400;
        return error;
    }) {
    const invalid = message => { throw createError(message); };
    if (!path || path.length > 8192 || /[#\\\s]/.test(path)) invalid('Invalid Graph path');
    const [pathname, ...query] = path.split('?');
    const attachment = /^\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/.exec(pathname);
    const messageCollection = ['/me/messages', '/me/mailFolders/inbox/messages'].includes(pathname);
    if (!['/me', '/me/calendarView'].includes(pathname) && !messageCollection && !attachment) invalid('Invalid Graph path');
    if (attachment) {
        for (const segment of attachment.slice(1)) {
            let decoded;
            try { decoded = decodeURIComponent(segment); } catch { invalid('Invalid Graph path'); }
            if (!/^(?:[A-Za-z0-9_~.!*'()-]|%[a-f0-9]{2})+$/i.test(segment) ||
                decoded === '.' || decoded === '..' || /[/\\%?#\s\x00-\x1f\x7f]/.test(decoded)) invalid('Invalid Graph path');
        }
    }
    const params = new URLSearchParams(query.join('?'));
    const allowed = new Set(['$select', '$top', '$filter', '$orderby', '$skip', '$skiptoken', 'startDateTime', 'endDateTime']);
    const expansions = params.getAll('$expand');
    if (expansions.length) {
        if (!messageCollection || expansions.length !== 1 || expansions[0] !== 'attachments($select=id,isInline)') invalid('Invalid Graph query');
        allowed.add('$expand');
    }
    for (const key of params.keys()) if (!allowed.has(key)) invalid('Invalid Graph query');
    return `https://graph.microsoft.com/v1.0${pathname}${params.toString() ? `?${params}` : ''}`;
}
