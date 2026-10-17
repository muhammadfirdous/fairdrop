"""Start both services and terminate their entire process groups on exit (macOS/Linux)."""
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
root = Path(__file__).resolve().parents[1]
children = []
api_port = int(os.getenv('FAIRDROP_API_PORT', '8000'))
web_port = int(os.getenv('FAIRDROP_WEB_PORT', '5174'))

def stop(*_):
    raise KeyboardInterrupt

for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, stop)
for port in (api_port, web_port):
    with socket.socket() as sock:
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            sys.exit(f'Port {port} is occupied. Stop that service or change both documented port settings before starting FairDrop.')
subprocess.run([str(root / '.venv/bin/alembic'), 'upgrade', 'head'], cwd=root, check=True)
try:
    for command in ([str(root / '.venv/bin/uvicorn'), 'backend.main:app', '--host', '127.0.0.1', '--port', str(api_port), '--reload'], ['pnpm', '--dir', 'frontend', 'dev']):
        children.append(subprocess.Popen(command, cwd=root, start_new_session=True))
    for url in (f'http://127.0.0.1:{api_port}/api/health', f'http://127.0.0.1:{web_port}'):
        for _ in range(100):
            if any(c.poll() is not None for c in children):
                raise RuntimeError('A development service exited before startup completed.')
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.2)
        else:
            raise RuntimeError(f'No ready response from {url}')
    print(f'\nFairDrop: http://127.0.0.1:{web_port}\nAPI: http://127.0.0.1:{api_port}/api/health\nCtrl-C stops both services.\n', flush=True)
    while all(c.poll() is None for c in children):
        time.sleep(0.5)
except KeyboardInterrupt:
    pass
finally:
    for child in children:
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    for child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
