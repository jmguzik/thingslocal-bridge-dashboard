"""Package only the public integration; no setup or household runtime data."""
import ast
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / 'custom_components/thingslocal_dashboard'


def build_release():
    version = json.loads((COMPONENT / 'manifest.json').read_text())['version']
    constants = ast.parse((COMPONENT / 'const.py').read_text())
    declared = next(ast.literal_eval(node.value) for node in constants.body if isinstance(node, ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == 'VERSION' for target in node.targets))
    if declared != version: raise ValueError('Version mismatch')
    files = sorted(path for path in COMPONENT.rglob('*') if path.is_file() and '__pycache__' not in path.parts
                   and path.suffix in ('.py', '.js', '.json', '.yaml'))
    for path in files:
        if path.is_symlink(): raise ValueError('Symlinks cannot be packaged')
        if path.suffix == '.py': compile(path.read_bytes(), str(path), 'exec')
    output = ROOT / 'dist' / f'thingslocal-dashboard-v{version}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with output.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for path in files + [ROOT/'README.md', ROOT/'LICENSE', ROOT/'UPSTREAM.md', ROOT/'scripts/install.sh']:
                data = path.read_bytes(); entry = tarfile.TarInfo(str(path.relative_to(ROOT)))
                entry.size = len(data); entry.mode = 0o755 if path.name == 'install.sh' else 0o644
                archive.addfile(entry, io.BytesIO(data))
    with zipfile.ZipFile(output.parent/'thingslocal_dashboard.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for path in files: archive.write(path, str(path.relative_to(COMPONENT)))
        for filename in ('LICENSE', 'UPSTREAM.md'): archive.write(ROOT/filename, filename)
    sums = ''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n'
                   for path in (output, output.parent/'thingslocal_dashboard.zip'))
    (output.parent/'SHA256SUMS').write_text(sums)
    return output


if __name__ == '__main__': print(build_release())
