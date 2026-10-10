import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function siteProvenance(env, version, commit) {
    const config = Object.fromEntries(['VITE_CLIENT_ID', 'VITE_TENANT_ID', 'VITE_DEVICE_LOGIN_URL', 'VITE_PHONE_LINK_URL']
        .map(name => [name, env[name] || (name === 'VITE_TENANT_ID' ? 'organizations' : '')]));
    return {
        version, commit,
        configurationDigest: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
        authentication: {
            browser: !!config.VITE_CLIENT_ID,
            device: !!config.VITE_DEVICE_LOGIN_URL,
            phone: !!config.VITE_PHONE_LINK_URL,
        },
    };
}

export function siteDigest(directory) {
    const hash = createHash('sha256');
    function visit(path, prefix = '') {
        for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
            const name = prefix + entry.name;
            if (entry.isDirectory()) visit(join(path, entry.name), name + '/');
            else if (entry.isFile()) {
                const bytes = readFileSync(join(path, entry.name));
                hash.update(`${name.length}:${name}:${bytes.length}:`);
                hash.update(bytes);
            } else throw new Error('Site artifacts must contain only regular files and directories');
        }
    }
    visit(directory);
    return hash.digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { loadEnv } = await import('vite');
    const env = { ...loadEnv('production', process.cwd()), ...process.env };
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync('dist/release.json', JSON.stringify(siteProvenance(env, version, commit)) + '\n');
}
