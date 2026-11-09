"""Serve a live, synthetic-only native fixture for visual inspection via CUA."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['SPACEFOOT_COLLECTOR_STARTUP_PROBE'] = '1'
from collectors.desktop_collector import collector_app as module

payload = {'hostname':'PC-DEMO-0048','manufacturer':'Dell','model':'Latitude 5420','osName':'Windows 11','cpu':'Intel Core i5','ramTotalGb':16,'storageTotalGb':512,'storageFreeGb':240,'collectorEngine':'synthetic'}
module.collector.collect = lambda include_mac: payload.copy()
def fixture_request(url, path, **kwargs):
    assert url == 'http://127.0.0.1:1/synthetic-only'
    if path == '/collect/profile': return {'collectionToken':'synthetic-only'}
    if path == '/collect/scan': return {'deviceId':'synthetic-device'}
    return {'teams':[{'id':'fixture-it','name':'IT Démonstration'}], 'establishments':[{'id':'fixture-lab','name':'Laboratoire'}]}
module.api_request = fixture_request
app = module.CollectorApp()
app.geometry('1180x840+40+40')
app.api_url.set('http://127.0.0.1:1/synthetic-only')
app.language.set('fr')
app.theme_preference.set('light')
for variable,value in [(app.first_name,'Recette'),(app.last_name,'Parcéo'),(app.email,'recette@example.invalid'),(app.team,'IT Démonstration'),(app.establishment,'Laboratoire'),(app.access_token,'synthetic-only')]:
    variable.set(value)
app.teams = [{'id':'fixture-it','name':'IT Démonstration'}]
app.establishments = [{'id':'fixture-lab','name':'Laboratoire'}]
app.profile_visible.set(False)
app._build_ui()
app.after(900000, app.destroy)
print('Synthetic Parcéo fixture ready; no hardware scan or production request is possible.', flush=True)
app.mainloop()
