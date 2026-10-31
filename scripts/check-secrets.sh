#!/bin/sh
# Docs: docs/env.md
# Scans staged + uncommitted changes. Full history: gitleaks git --redact .
if ! command -v gitleaks >/dev/null 2>&1; then
	echo "warning: gitleaks not installed, skipping secret scan (brew install gitleaks)" >&2
	exit 0
fi
gitleaks git --no-banner --redact --pre-commit --staged . && gitleaks git --no-banner --redact --pre-commit .
