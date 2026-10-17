import sys
import time
import urllib.request
for url in sys.argv[1:]:
    for attempt in range(100):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                assert response.status == 200
            break
        except Exception:
            time.sleep(0.2)
    else:
        raise SystemExit(f'Server did not start: {url}')
