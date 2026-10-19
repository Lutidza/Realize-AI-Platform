# @file .ai/tools/task-workspace/src/auth/secretService.helper.py
# @version 1.0.0
# @date 2026-10-19
# @description Выполняет ограниченный обмен с Linux Secret Service через приватные stdin/stdout pipes.
# @see documentation/architecture/platform-access.md
import json
import sys
import uuid


def main():
    import gi
    gi.require_version("Secret", "1")
    from gi.repository import Secret

    value = json.loads(sys.stdin.buffer.read(65537))
    if not isinstance(value, dict) or value.get("operation") not in {"probe", "read", "write", "remove"}:
        raise ValueError("invalid")
    schema = Secret.Schema.new("org.realize.TaskWorkspace", Secret.SchemaFlags.NONE,
                               {"connection": Secret.SchemaAttributeType.STRING})
    operation = value["operation"]
    key = value.get("key", "")
    if not isinstance(key, str) or len(key) > 2048:
        raise ValueError("invalid")
    attributes = {"connection": key}
    if operation == "probe":
        attributes = {"connection": "probe:" + str(uuid.uuid4())}
        secret = str(uuid.uuid4())
        try:
            if not Secret.password_store_sync(schema, attributes, Secret.COLLECTION_DEFAULT,
                                              "Realize CLI secure storage check", secret, None):
                raise ValueError("unavailable")
            if Secret.password_lookup_sync(schema, attributes, None) != secret:
                raise ValueError("unavailable")
        finally:
            Secret.password_clear_sync(schema, attributes, None)
        result = None
    elif operation == "read":
        secret = Secret.password_lookup_sync(schema, attributes, None)
        result = None if secret is None else json.loads(secret)
    elif operation == "write":
        if "value" not in value:
            raise ValueError("invalid")
        if not Secret.password_store_sync(schema, attributes, Secret.COLLECTION_DEFAULT,
                                          "Realize CLI connection", json.dumps(value["value"]), None):
            raise ValueError("unavailable")
        result = None
    else:
        Secret.password_clear_sync(schema, attributes, None)
        result = None
    return {"ok": True, "value": result}


try:
    sys.stdout.write(json.dumps(main()))
except Exception:
    # Исключения GI и JSON могут содержать secret; наружу выходит только фиксированный код.
    sys.stdout.write('{"ok":false}')
    sys.exit(1)
