# Docs: docs/auth-and-keys.md
"""AES-256-GCM for BYOK keys. Same format as apps/web/src/lib/server/crypto.ts:
iv = 12 random bytes, ciphertext = encrypted bytes || 16-byte GCM tag,
key = base64 ENCRYPTION_KEY."""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key(key_b64: str | None) -> AESGCM:
    raw = base64.b64decode(key_b64 or os.environ.get("ENCRYPTION_KEY", ""))
    if len(raw) != 32:
        raise RuntimeError("ENCRYPTION_KEY must be 32 bytes, base64-encoded (apps/worker/.env)")
    return AESGCM(raw)


def encrypt(plaintext: str, key_b64: str | None = None) -> tuple[bytes, bytes]:
    """Returns (iv, ciphertext)."""
    iv = os.urandom(12)
    return iv, _key(key_b64).encrypt(iv, plaintext.encode(), None)


def decrypt(ciphertext: bytes, iv: bytes, key_b64: str | None = None) -> str:
    return _key(key_b64).decrypt(iv, bytes(ciphertext), None).decode()
