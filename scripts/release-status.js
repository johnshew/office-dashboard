import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function releaseStatus(candidate, published, deployed) {
    return {
        generatedAt: new Date().toISOString(),
        candidate,
        published: published || { status: 'No published stable GitHub release observed' },
        deployed: deployed || { status: 'Not queried; use --site with the public HTTPS site URL' },
        acceptance: { status: 'Not inferred from source, tags or provenance', evidence: 'RELEASE.md' },
        backends: { status: 'Not queried; Pages does not establish Worker or Node deployment' },
        authorization: 'No publication or deployment authorization is inferred by this report',
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--site')) {
        throw new Error('Usage: npm run release:status -- [--site <public-HTTPS-site-URL>]');
    }
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const candidate = { version: JSON.parse(readFileSync('package.json', 'utf8')).version,
        commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain') };
    const releases = JSON.parse(execFileSync('gh', ['release', 'list', '--repo', 'johnshew/office-dashboard',
        '--exclude-drafts', '--exclude-pre-releases', '--limit', '1', '--json', 'tagName,publishedAt'],
    { encoding: 'utf8' }));
    let deployed;
    if (args.length) {
        const site = new URL(args[1]);
        if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) {
            throw new Error('The site must be a public HTTPS URL without credentials, query or fragment');
        }
        const response = await fetch(new URL('release.json', site.href.replace(/\/?$/, '/')), {
            redirect: 'error', signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Provenance request failed: HTTP ${response.status}`);
        const metadata = await response.json();
        if (!metadata || !/^\d+\.\d+\.\d+$/.test(metadata.version) || !/^[a-f0-9]{40}$/.test(metadata.commit)
            || (metadata.configurationDigest !== undefined && !/^[a-f0-9]{64}$/.test(metadata.configurationDigest))) {
            throw new Error('Invalid deployed provenance');
        }
        deployed = { version: metadata.version, commit: metadata.commit,
            configurationDigest: metadata.configurationDigest || 'Not recorded by this release' };
    }
    console.log(JSON.stringify(releaseStatus(candidate, releases[0], deployed), null, 2));
}
