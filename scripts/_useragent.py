"""Shared HTTP identity for the data-collection scripts.

Wikimedia (and good manners generally) ask a crawler to identify itself with a
descriptive User-Agent that points somewhere a site operator can reach us. That
"somewhere" must not be a person's address baked into source control: the repo is
private-but-multi-operator, and a hardcoded contact goes stale the moment that
person stops being the contact.

So the project URL is the constant part, and the human contact is supplied at run
time by the operator doing the collecting:

    export COURT_TRACKER_CONTACT='you@example.org'    # or a profile/issue URL

With it set:    FederalCourtTracker/0.1 (+https://github.com/...; you@example.org)
Without it:     FederalCourtTracker/0.1 (+https://github.com/...)

Both are valid, descriptive User-Agents; setting it is polite when you are about to
make thousands of requests, and Wikimedia's UA policy asks for it specifically.
"""
from __future__ import annotations
import os

PROJECT = "FederalCourtTracker"
VERSION = "0.1"
PROJECT_URL = "https://github.com/digitalgroundgame/court-tracker"
CONTACT_ENV = "COURT_TRACKER_CONTACT"


def user_agent(note: str | None = None) -> str:
    """Build the project User-Agent, appending $COURT_TRACKER_CONTACT when set.

    `note` is an optional free-text qualifier for the parenthetical (e.g. the kind
    of traffic this particular script generates).
    """
    parts = [note] if note else []
    parts.append(f"+{PROJECT_URL}")
    contact = os.environ.get(CONTACT_ENV, "").strip()
    if contact:
        parts.append(contact)
    return f"{PROJECT}/{VERSION} ({'; '.join(parts)})"
