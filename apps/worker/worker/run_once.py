# Docs: docs/queue.md
"""Process exactly one item and exit: `python -m worker.run_once <kind> <id>` (docs/queue.md)."""

import sys
from collections.abc import Callable

import main


def run_job(job_id: str) -> str:
    job = main.claim_job(job_id)
    if not job:
        return "failed: not claimable (not pending, missing, or user already has 2 processing)"
    return main.process(job)


# One line per kind; later plans add render, post, checkpoint here.
HANDLERS: dict[str, Callable[[str], str]] = {
    "job": run_job,
}


def cli(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] not in HANDLERS:
        print(f"usage: python -m worker.run_once <{'|'.join(HANDLERS)}> <id>", file=sys.stderr)
        return 2
    kind, item_id = argv
    result = HANDLERS[kind](item_id)
    print(f"{kind} {item_id}: {result}")
    return 1 if result.startswith("failed") else 0


if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))
