"""Render the real Windows Tk collector with synthetic data, without scanning/sending.

Checks owned Tk widgets only. Native visual inspection requires CUA app access.
Uses standard-library widget checks; live screenshots are obtained via CUA.
"""
import json
import ctypes
import os
from pathlib import Path
import sys
import tkinter as tk
from tkinter import font as tkfont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ['SPACEFOOT_COLLECTOR_STARTUP_PROBE'] = '1'
from collectors.desktop_collector import collector_app as module
from collectors.desktop_collector import ui

OUT = ROOT / 'docs/operations/2026-11-09-sillage-integration'
OUT.mkdir(parents=True, exist_ok=True)

def capture(app, name):
    app.update_idletasks()
    return {'file': None, 'requestedView': name, 'width': app.winfo_width(), 'height': app.winfo_height(), 'visualCapture': 'widget-state-only; live CUA evidence is recorded separately'}

def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)

def contrast(a, b):
    def lum(color):
        rgb = [int(color[i:i+2],16)/255 for i in (1,3,5)]
        v = [n/12.92 if n <= .04045 else ((n+.055)/1.055)**2.4 for n in rgb]
        return sum(n*w for n,w in zip(v,(.2126,.7152,.0722)))
    a,b = sorted((lum(a),lum(b)))
    return (b+.05)/(a+.05)

app = module.CollectorApp()
app.withdraw()
app.geometry('1180x840+3000+3000')
app.language.set('fr')
for variable,value in [(app.first_name,'Recette'),(app.last_name,'Parcéo'),(app.email,'recette@example.invalid'),(app.team,'IT · Démonstration'),(app.establishment,'Laboratoire')]:
    variable.set(value)
app.profile_visible.set(True)
result = {'syntheticOnly': True, 'realHardwareScanned': False, 'networkRequests': 0, 'windowTitle': app.title(), 'privateFonts': app.private_font_status, 'fonts': app.brand_fonts, 'screens': [], 'buttonContrasts': []}
try:
    identity = ctypes.c_wchar_p()
    get_identity = ctypes.WinDLL('shell32').GetCurrentProcessExplicitAppUserModelID
    get_identity.argtypes = [ctypes.POINTER(ctypes.c_wchar_p)]
    get_identity.restype = ctypes.c_long
    assert get_identity(ctypes.byref(identity)) == 0
    try:
        result['windowsAppUserModelId'] = identity.value
        assert identity.value == 'Piqa.Parceo.Collector'
    finally:
        release = ctypes.WinDLL('ole32').CoTaskMemFree
        release.argtypes = [ctypes.c_void_p]
        release(identity)
    assert app.brand_fonts == {'interface':'Manrope','technical':'IBM Plex Mono'}, app.brand_fonts
    assert all(app.private_font_status.values())
    assert app.title().startswith('Parcéo Collector')
    for theme in ('light','dark'):
        app.theme_preference.set(theme)
        app._build_ui(); app.show_step(0); app.update()
        result['screens'].append(capture(app,f'collector-profile-{theme}.png'))
        for button in descendants(app):
            if isinstance(button,ui.ThemedButton) and button.winfo_manager() and button.cget('state') == 'normal':
                ratio = contrast(button.cget('fg'),button.cget('bg'))
                assert ratio >= 4.5, (button.cget('text'),ratio)
                result['buttonContrasts'].append({'theme':theme,'label':button.cget('text'),'ratio':round(ratio,2)})
        app.payload = {'hostname':'PC-DEMO-0048','manufacturer':'Dell','model':'Latitude 5420','osName':'Windows 11','cpu':'Intel Core i5','ramTotalGb':16,'storageTotalGb':512,'storageFreeGb':240,'collectorEngine':'synthetic'}
        app.show_step(1); app.render_scan_summary(); app.update()
        result['screens'].append(capture(app,f'collector-scan-{theme}.png'))
        app.submitted = True; app.submission_device_id='synthetic-device'; app.show_submission_success(); app.update()
        result['screens'].append(capture(app,f'collector-success-{theme}.png'))
        app.submitted = False; app.payload = {}
    app.geometry('1040x760+3000+3000'); app.theme_preference.set('light'); app._build_ui(); app.show_step(0); app.update()
    result['screens'].append(capture(app,'collector-profile-minimum.png'))
    assert app.callback_exception_count == 0
    result['callbackExceptions'] = app.callback_exception_count
    result['passed'] = True
finally:
    app.destroy()
    (OUT/'collector-render.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':result.get('passed'),'screens':len(result['screens']),'fonts':result['fonts'],'contrasts':len(result['buttonContrasts'])}))


