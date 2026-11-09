"""Hidden native Tk smoke using synthetic hardware and an in-process API fixture."""
import json
import os
from pathlib import Path
import sys
import tkinter as tk

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ['SPACEFOOT_COLLECTOR_STARTUP_PROBE'] = '1'
original_init = tk.Tk.__init__

def hidden_init(self, *args, **kwargs):
    original_init(self, *args, **kwargs)
    self.withdraw()

tk.Tk.__init__ = hidden_init
from collectors.desktop_collector import collector_app as module

assert module.collector is not None
module.save_draft = lambda values: None
module.clear_sensitive_draft = lambda: None
calls = []
endpoint = 'http://127.0.0.1:1/synthetic-inventory'

def api_fixture(url, path, **kwargs):
    assert url == endpoint
    calls.append(path)
    if path == '/collect/profile':
        assert kwargs['body']['team'] == 'IT fixture'
        return {'collectionToken': 'synthetic-scan-token'}
    assert path == '/collect/scan'
    assert kwargs['headers']['Authorization'] == 'Bearer synthetic-scan-token'
    assert kwargs['body']['hostname'] == 'SYNTHETIC-ONLY'
    assert kwargs['body']['storageFreeGb'] == 0
    return {'deviceId': 'synthetic-device'}

module.api_request = api_fixture
module.collector.collect = lambda include_mac: {
    'hostname': 'SYNTHETIC-ONLY', 'manufacturer': 'Fixture', 'model': 'Fixture PC',
    'osName': 'Windows fixture', 'cpu': 'Fixture CPU', 'ramTotalGb': 16,
    'storageTotalGb': 512, 'storageFreeGb': 0, 'collectorEngine': 'synthetic',
}
result = {'syntheticOnly': True, 'realHardwareScanned': False, 'networkRequests': 0,
          'checks': {}, 'errors': []}
app = module.CollectorApp()
app.api_url.set(endpoint)
for variable, value in [(app.first_name, 'Synthetic'), (app.last_name, 'Fixture'),
                        (app.email, 'synthetic@example.invalid'), (app.team, 'IT fixture'),
                        (app.establishment, 'Lab fixture'), (app.access_token, 'synthetic-access-token')]:
    variable.set(value)

def fail(error):
    result['errors'].append(str(error))
    if not app._closing:
        app.destroy()

def check_submission():
    try:
        if not app.submitted:
            app.after(50, check_submission)
            return
        assert app.submission_device_id == 'synthetic-device'
        assert calls == ['/collect/profile', '/collect/scan']
        app.show_submission_success()
        assert app.callback_exception_count == 0
        result['checks']['submission'] = True
        result['checks']['uiCallbacks'] = True
        result['passed'] = True
        app.destroy()
    except Exception as error:
        fail(error)

def check_scan():
    try:
        if not app.payload:
            app.after(50, check_scan)
            return
        assert app.payload['collectorBuildChannel'] == 'source'
        app.render_scan_summary()
        result['checks']['scanSummary'] = True
        app.submit_inventory()
        app.after(50, check_submission)
    except Exception as error:
        fail(error)

def start():
    try:
        assert app.profile_body()['email'] == 'synthetic@example.invalid'
        result['checks']['profile'] = True
        app.scan_computer()
        app.after(50, check_scan)
    except Exception as error:
        fail(error)

app.after(100, start)
app.after(8000, lambda: fail('Collector fixture timed out'))
app.mainloop()
result['callbackExceptions'] = app.callback_exception_count
output = Path(os.environ.get('SPACEFOOT_COLLECTOR_ACCEPTANCE_OUTPUT', 'docs/operations/2026-11-06-release/collector-ui.json'))
output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
raise SystemExit(0 if result.get('passed') else 1)
