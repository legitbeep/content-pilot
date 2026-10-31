import base64
import json
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag

from worker.crypto import decrypt, encrypt

# Shared with apps/web/src/lib/server/crypto.test.ts: each language decrypts the other's output.
FX = json.loads((Path(__file__).parents[3] / "fixtures" / "crypto.json").read_text())


def _dec(entry: dict) -> str:
    b = base64.b64decode
    return decrypt(b(entry["ciphertext"]), b(entry["iv"]), FX["key"])


def test_decrypts_value_encrypted_by_web():
    assert _dec(FX["from_ts"]) == FX["from_ts"]["plaintext"]


def test_decrypts_own_fixture_entry():
    assert _dec(FX["from_python"]) == FX["from_python"]["plaintext"]


def test_round_trip_and_tamper():
    iv, ct = encrypt("secret", FX["key"])
    assert len(iv) == 12 and decrypt(ct, iv, FX["key"]) == "secret"
    with pytest.raises(InvalidTag):
        decrypt(bytes([ct[0] ^ 1]) + ct[1:], iv, FX["key"])
