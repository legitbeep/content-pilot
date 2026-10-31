# syntax=docker/dockerfile:1
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_PROJECT_ENVIRONMENT=/opt/venv PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev
# NSFW image model (pipeline/nsfw_check.py): Falconsai/nsfw_image_detection, Apache-2.0, ONNX int8
# port pinned by commit + sha256 so the worker never downloads weights at runtime.
ADD --checksum=sha256:d9afb1e057104e6cc8616d174f0f6a8b8b0389c839eea7d5efa4bdf1a77efd27 \
    https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/onnx/model_quantized.onnx \
    /app/models/nsfw.onnx
COPY . .
CMD ["uv", "run", "--no-sync", "python", "main.py"]
