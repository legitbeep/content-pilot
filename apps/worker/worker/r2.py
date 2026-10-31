# Docs: docs/pipeline.md
"""Cloudflare R2 via boto3 (S3 API). Presigned GET URLs let ffprobe/Deepgram read the source
directly, so the worker never downloads whole videos for these steps."""

import json
import os
from functools import cache

import boto3
from botocore.exceptions import ClientError


@cache
def _client():
    account = os.environ.get("R2_ACCOUNT_ID")
    if not account:
        raise RuntimeError("R2_* env vars are not set (apps/worker/.env)")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _bucket() -> str:
    return os.environ["R2_BUCKET"]


def presigned_get(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": _bucket(), "Key": key}, ExpiresIn=expires
    )


def put_json(key: str, data: object) -> None:
    _client().put_object(
        Bucket=_bucket(), Key=key, Body=json.dumps(data).encode(), ContentType="application/json"
    )


def get_bytes(key: str) -> bytes:
    return _client().get_object(Bucket=_bucket(), Key=key)["Body"].read()


def exists(key: str) -> bool:
    try:
        _client().head_object(Bucket=_bucket(), Key=key)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def upload_file(path: str, key: str, content_type: str = "video/mp4") -> None:
    _client().upload_file(path, _bucket(), key, ExtraArgs={"ContentType": content_type})


def download_file(key: str, path: str) -> None:
    _client().download_file(_bucket(), key, path)


def delete(key: str) -> None:
    """Missing objects count as deleted (S3 DELETE is idempotent)."""
    _client().delete_object(Bucket=_bucket(), Key=key)
