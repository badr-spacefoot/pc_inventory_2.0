"""Run remotely as root: stage immutable static files, then validate proxy cutover."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

root = Path('/srv/parceo')
assert os.geteuid() == 0
assert root.resolve() == root and not root.is_symlink()
mode, release, expected = sys.argv[1:]
assert release.replace('-', '').isalnum()
incoming = Path('/tmp/parceo-publication')
archive = incoming / 'site.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected

def run(*args, capture=False):
    return subprocess.run(args, check=True, capture_output=capture, text=True)

if mode in {'stage', 'update'}:
    if mode == 'stage':
        root.mkdir(mode=0o755, exist_ok=False)
        (root / 'site/releases').mkdir(parents=True)
    else:
        assert root.is_dir() and (root / 'site/current').is_symlink()
    target = root / 'site/releases' / release
    target.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            relative = PurePosixPath(item.filename)
            assert not relative.is_absolute() and '..' not in relative.parts
            assert not relative.name.startswith('.env')
            destination = target.joinpath(*relative.parts)
            assert destination.resolve().is_relative_to(target)
            assert not item.is_dir()
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(bundle.read(item))
    assert (target / 'health.txt').read_text().strip() == 'ok'
    assert 'Parcéo' in (target / 'index.html').read_text()
    if mode == 'stage':
        (root / 'site/current').symlink_to(f'releases/{release}')
        for name in ['Caddyfile', 'compose.yml', 'Caddyfile.route']:
            shutil.copyfile(incoming / name, root / name)
        run('docker', 'compose', '-f', str(root / 'compose.yml'), 'config', '--quiet')
        run('docker', 'compose', '-f', str(root / 'compose.yml'), 'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '75')
    else:
        manifest = json.loads((target / 'collector-releases.json').read_text())
        assert manifest['manualOnly'] is True and manifest['signed'] is False
        assert set(manifest['assets']) == {'windows', 'macos', 'linux'}
        previous = (root / 'site/current').readlink()
        pending = root / 'site/current.next'
        assert not pending.exists() and not pending.is_symlink()
        pending.symlink_to(f'releases/{release}')
        pending.replace(root / 'site/current')
    try:
        run('docker', 'exec', 'piqa-caddy', 'wget', '-q', '-O', '-', 'http://piqa-parceo-web:8080/health.txt')
    except Exception:
        if mode == 'update':
            pending.symlink_to(previous)
            pending.replace(root / 'site/current')
        raise
    print(json.dumps({'staged': release, 'archiveSha256': expected, 'mode': mode}))
elif mode == 'cutover':
    assert (root / 'site/current').resolve() == root / 'site/releases' / release
    config = Path('/srv/vaultwarden/Caddyfile')
    original = config.read_bytes()
    assert b'parceo.piqa.fr' not in original, 'Existing route requires explicit comparison'
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    backup = config.with_name('Caddyfile.before-parceo-' + stamp)
    backup.write_bytes(original)
    backup.chmod(0o600)
    candidate = root / ('Caddyfile.proxy-' + stamp)
    candidate.write_bytes(original.rstrip() + b'\n\n' + (root / 'Caddyfile.route').read_bytes())
    candidate.chmod(0o600)
    run('docker', 'cp', str(candidate), 'piqa-caddy:/tmp/parceo-candidate')
    run('docker', 'exec', 'piqa-caddy', 'caddy', 'validate', '--config', '/tmp/parceo-candidate', '--adapter', 'caddyfile', capture=True)
    # Preserve the bind-mounted file inode; a rename would leave the container
    # reading its old mount. Compare again to avoid overwriting another deploy.
    assert config.read_bytes() == original, 'Proxy changed during preparation'
    try:
        config.write_bytes(candidate.read_bytes())
        run('docker', 'exec', 'piqa-caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', capture=True)
    except Exception:
        config.write_bytes(original)
        run('docker', 'exec', 'piqa-caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', capture=True)
        raise
    print(json.dumps({'cutover': release, 'proxyBackup': str(backup), 'existingConfigPreserved': True}))
else:
    raise SystemExit('Expected stage or cutover')
