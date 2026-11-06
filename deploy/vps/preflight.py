"""Read-only capacity and rendered Compose checks; never starts or alters services."""
import argparse
import base64
import hashlib
import hmac
import json
import shutil
import time
from pathlib import Path


def configured_secret(value, minimum=32):
    return isinstance(value, str) and len(value) >= minimum and not value.lower().startswith(
        ("replace", "your-", "changeme", "this_password_is_insecure")
    )


def valid_legacy_key(token, secret, role):
    """The pinned upstream supplies HS256 keys to Edge Runtime and Storage."""
    try:
        if not isinstance(token, str) or len(token) > 16384:
            return False
        header, payload, signature = token.split(".")
        decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        claims = json.loads(decode(payload))
        expected = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        return (json.loads(decode(header)).get("alg") == "HS256"
                and claims.get("role") == role
                and type(claims.get("exp")) in (int, float)
                and claims["exp"] > time.time()
                and hmac.compare_digest(expected, decode(signature)))
    except (ValueError, TypeError, AttributeError, UnicodeError):
        return False


def validate_config(config):
    errors = []
    if config.get("name") != "parc":
        errors.append("Compose project must be parc")
    services = config.get("services", {})
    for required in {"db", "api-gw", "web", "storage", "functions", "rest"}:
        if required not in services:
            errors.append(f"Missing required service: {required}")
    for name, service in config.get("services", {}).items():
        if service.get("network_mode"):
            errors.append(f"{name}: explicit network_mode is forbidden")
        if service.get("ports"):
            errors.append(f"{name}: host ports must not be published")
        container = service.get("container_name", "")
        if container and not container.startswith("parc-"):
            errors.append(f"{name}: foreign global container name")
        if service.get("privileged"):
            errors.append(f"{name}: privileged containers are forbidden")
        for volume in service.get("volumes", []):
            if "docker.sock" in str(volume):
                errors.append(f"{name}: Docker socket access is forbidden")
        expected_networks = ({"default", "proxy"} if name == "api-gw" else
                             {"proxy"} if name == "web" else
                             {"default", "egress"} if name in {"functions", "auth"} else {"default"})
        if set(service.get("networks", {})) != expected_networks:
            errors.append(f"{name}: unexpected network attachments")
        if name not in {"api-gw", "web"} and "proxy" in service.get("networks", {}):
            errors.append(f"{name}: backend must not join the shared proxy network")
    networks = config.get("networks", {})
    if not networks.get("default", {}).get("internal"):
        errors.append("Backend network must be internal")
    if networks.get("proxy", {}).get("name") != "parc_proxy":
        errors.append("Proxy must use dedicated parc_proxy network")
    if not networks.get("proxy", {}).get("external"):
        errors.append("Proxy network must be explicitly external")
    if networks.get("default", {}).get("external") or networks.get("egress", {}).get("external"):
        errors.append("Backend and egress networks must belong only to parc")
    functions = config.get("services", {}).get("functions", {}).get("environment", {})
    if str(functions.get("VERIFY_JWT", "")).lower() != "false":
        errors.append("Inventory API needs custom application auth, VERIFY_JWT=false")
    application_keys = ["ADMIN_SESSION_SECRET", "COLLECTION_ACCESS_TOKEN", "CPU_BENCHMARK_SYNC_TOKEN", "CPU_RELEASE_SYNC_TOKEN", "ENRICHMENT_SYNC_TOKEN"]
    for key in application_keys:
        value = str(functions.get(key, ""))
        if not configured_secret(value):
            errors.append(f"{key}: configure a strong deployment secret")
    if len({functions.get(key) for key in application_keys}) != len(application_keys):
        errors.append("Application credentials must not be reused across roles")
    database = services.get("db", {}).get("environment", {})
    if not configured_secret(database.get("POSTGRES_PASSWORD")):
        errors.append("POSTGRES_PASSWORD: replace the upstream default")
    jwt_secret = functions.get("JWT_SECRET", "")
    if not configured_secret(jwt_secret) or jwt_secret != database.get("JWT_SECRET"):
        errors.append("JWT_SECRET: configure matching non-default platform secrets")
    else:
        for key, role in [("SUPABASE_ANON_KEY", "anon"), ("SUPABASE_SERVICE_ROLE_KEY", "service_role")]:
            if not valid_legacy_key(functions.get(key), jwt_secret, role):
                errors.append(f"{key}: configure an unexpired key signed by the platform secret with the correct role")
    if functions.get("SUPABASE_PUBLIC_URL") != "https://parc-api.piqa.fr":
        errors.append("SUPABASE_PUBLIC_URL must use the public parc API origin")
    origins = {item.strip() for item in str(functions.get("ALLOWED_ORIGINS", "")).split(",")}
    if "https://parc.piqa.fr" not in origins or "*" in origins:
        errors.append("ALLOWED_ORIGINS must include the parc frontend without a wildcard")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Private docker compose config --format json output")
    parser.add_argument("--data-path", default="/srv")
    parser.add_argument("--config-only", action="store_true", help="Skip host checks for offline configuration tests")
    args = parser.parse_args()
    errors = validate_config(json.loads(Path(args.config).read_text(encoding="utf-8")))
    if not args.config_only:
        free_gib = shutil.disk_usage(args.data_path).free / 1024**3
        if free_gib < 40:
            errors.append(f"Only {free_gib:.1f} GiB free; reserve at least 40 GiB before provisioning")
        meminfo = Path("/proc/meminfo")
        if not meminfo.exists():
            errors.append("Host capacity check must run on the Linux target")
        else:
            values = dict(line.split(":", 1) for line in meminfo.read_text().splitlines())
            available_gib = int(values["MemAvailable"].split()[0]) / 1024**2
            if available_gib < 4:
                errors.append(f"Only {available_gib:.1f} GiB available RAM; reserve at least 4 GiB for the new stack")
    # Only error descriptions are printed, never rendered secrets/configuration.
    print(json.dumps({"passed": not errors, "errors": errors}, indent=2))
    raise SystemExit(bool(errors))


if __name__ == "__main__":
    main()
