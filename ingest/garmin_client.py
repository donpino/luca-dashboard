"""Authenticated Garmin Connect client.

Credentials come from ingest/.env (GARMIN_EMAIL, GARMIN_PASSWORD) — see
CLAUDE.md rule 8: never logged, never printed, never committed. Session
tokens are cached outside the repo entirely (in the user's home directory),
so a persisted login can never end up in a git-tracked file.
"""

import os
from pathlib import Path

import garminconnect
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# Deliberately outside the repo tree — a token file is a bearer credential,
# same sensitivity as the password itself (CLAUDE.md rule 8).
TOKENSTORE = str(Path.home() / ".garminconnect_luca_dashboard")


def _prompt_mfa() -> str:
    try:
        return input("Garmin MFA code (sent by email): ").strip()
    except EOFError:
        # GitHub Actions has no interactive stdin (CLAUDE.md rule 8 / spec
        # §6, v1.8): a fresh login can only reach here if the cached token
        # store is missing or expired. Fail with an actionable message
        # instead of a bare traceback — the fix is to log in interactively
        # on a local machine and re-seed the GARMIN_TOKEN_SEED GitHub
        # Actions secret from the refreshed token directory (see sync.yml).
        raise RuntimeError(
            "Garmin requested an MFA code but this run has no interactive "
            "terminal to supply one. This means there is no valid cached "
            "Garmin session (see TOKENSTORE / GARMIN_TOKEN_SEED). Log in "
            "locally with `python sync.py` to refresh "
            f"{TOKENSTORE}, then re-seed the GARMIN_TOKEN_SEED secret from "
            "it (see .github/workflows/sync.yml)."
        ) from None


def get_client() -> garminconnect.Garmin:
    """Return an authenticated Garmin Connect client.

    Tries the cached token store first; falls back to email/password login,
    prompting on the terminal for an MFA code if Garmin requires one.
    """
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError(
            "GARMIN_EMAIL / GARMIN_PASSWORD not set. Copy ingest/.env.example "
            "to ingest/.env and fill in real values."
        )

    client = garminconnect.Garmin(
        email=email,
        password=password,
        prompt_mfa=_prompt_mfa,
    )
    client.login(tokenstore=TOKENSTORE)
    return client
