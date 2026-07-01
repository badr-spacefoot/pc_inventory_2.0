# Spacefoot osquery collection mode

The desktop collector can use `osqueryi` as its preferred hardware inventory engine.

Benefits:

- Uses a known enterprise inventory tool instead of direct custom probing.
- Works across Windows, macOS and Linux.
- Keeps the existing Spacefoot review-and-submit UX.
- Avoids the previous custom native probing path that can trigger antivirus products.

## Local test

Install osquery, then run:

```powershell
python scripts/collect-cross-platform.py --api-url "https://YOUR_PROJECT.supabase.co/functions/v1/inventory-api" --token "COLLECTION_SCAN_TOKEN"
```

For a dry local payload check without uploading:

```powershell
python -c "import json, importlib.util; spec=importlib.util.spec_from_file_location('collector','scripts/collect-cross-platform.py'); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); print(json.dumps(mod.collect(True), indent=2))"
```

The payload includes:

- `collectorEngine`: `osquery`
- `collectorEngineVersion`
- `osqueryVersion` when osquery is used

If `osqueryi` is missing, collection fails with a clear setup message. Production packaging should bundle or install osquery so the user experiences this as one trusted app.

## Windows deployment idea

Production goal: ship one signed Spacefoot installer that bundles or installs osquery and the Spacefoot uploader/reviewer.

Pilot option: install osquery with MSI, GPO, Intune or another IT deployment tool, then distribute the Spacefoot uploader/reviewer.

If osquery is installed in a custom location, set:

```powershell
$env:SPACEFOOT_OSQUERYI = "C:\Path\To\osqueryi.exe"
```

## Query pack

`spacefoot_inventory.sql` contains the approved inventory queries used by this mode. The Python collector runs equivalent queries one by one and normalizes the result into the existing Supabase payload shape.
