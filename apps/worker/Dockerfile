# syntax=docker/dockerfile:1
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fontconfig && rm -rf /var/lib/apt/lists/*
# Caption fonts for burned captions (libass looks them up by family name): the editor default
# Hanken Grotesk + CAPTION_FONTS in apps/web/src/lib/entities/brand/model.ts. OFL, google/fonts
# pinned by commit + sha256. Any other name falls back to the system font (DejaVu).
ADD --checksum=sha256:813b3f8fa0965405669a89b38e51bbefd95eef6b8e20d1cb2d8c10cce062662f \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/hankengrotesk/HankenGrotesk%5Bwght%5D.ttf \
    /usr/share/fonts/truetype/captions/HankenGrotesk.ttf
ADD --checksum=sha256:29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031 \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/inter/Inter%5Bopsz,wght%5D.ttf \
    /usr/share/fonts/truetype/captions/Inter.ttf
ADD --checksum=sha256:0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7 \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/montserrat/Montserrat%5Bwght%5D.ttf \
    /usr/share/fonts/truetype/captions/Montserrat.ttf
ADD --checksum=sha256:7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/poppins/Poppins-Regular.ttf \
    /usr/share/fonts/truetype/captions/Poppins-Regular.ttf
ADD --checksum=sha256:08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73 \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/bebasneue/BebasNeue-Regular.ttf \
    /usr/share/fonts/truetype/captions/BebasNeue-Regular.ttf
ADD --checksum=sha256:a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/anton/Anton-Regular.ttf \
    /usr/share/fonts/truetype/captions/Anton-Regular.ttf
ADD --checksum=sha256:d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134 \
    https://raw.githubusercontent.com/google/fonts/6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf \
    /usr/share/fonts/truetype/captions/Roboto.ttf
RUN chmod 644 /usr/share/fonts/truetype/captions/* && fc-cache -f
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
