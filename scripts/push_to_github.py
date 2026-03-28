#!/usr/bin/env python3
"""
Commit and push local changes to GitHub using values from .env.
"""

import os
import stat
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / ".env"
COMMIT_MESSAGE = "chore: update repos data"

load_dotenv(ENV_FILE)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

if not GITHUB_TOKEN:
    raise SystemExit("ERROR: GITHUB_TOKEN not found in .env file")


def run_git(args, env=None):
    """Run a git command inside the repo and print its output."""
    print(f"Running: git {' '.join(args)}")
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )

    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.returncode != 0:
        error_message = completed.stderr.strip() or "Unknown git error"
        raise SystemExit(error_message)

    return completed.stdout.strip()


def create_askpass_script():
    """Create a temporary askpass helper so the token is not written to git config."""
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        delete=False,
        prefix="git-askpass-",
        suffix=".sh",
    ) as handle:
        handle.write(
            "#!/bin/sh\n"
            'case "$1" in\n'
            '  *Username*) printf "%s\\n" "x-access-token" ;;\n'
            '  *Password*) printf "%s\\n" "$GITHUB_TOKEN" ;;\n'
            '  *) printf "\\n" ;;\n'
            "esac\n"
        )
        script_path = handle.name

    os.chmod(script_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    return script_path


def commits_ahead(branch_name):
    """Return how many commits the current branch is ahead of origin."""
    try:
        ahead_count = run_git(["rev-list", "--count", f"origin/{branch_name}..{branch_name}"])
    except SystemExit:
        return 0

    return int(ahead_count or "0")


def main():
    """Stage, commit, pull, and push changes."""
    print("=" * 60)
    print("Pushing changes to GitHub")
    print("=" * 60)

    askpass_script = create_askpass_script()
    git_env = os.environ.copy()
    git_env["GITHUB_TOKEN"] = GITHUB_TOKEN
    git_env["GIT_ASKPASS"] = askpass_script
    git_env["GIT_TERMINAL_PROMPT"] = "0"

    try:
        run_git(["status", "--short"])
        run_git(["add", "-A"])

        current_branch = run_git(["branch", "--show-current"])
        if not current_branch:
            raise SystemExit("Unable to determine the current branch.")

        staged_changes = run_git(["diff", "--cached", "--name-only"])
        if not staged_changes:
            if commits_ahead(current_branch) == 0:
                print("No changes to commit or push.")
                return
            print("No new changes to commit. Pushing existing local commits.")
        else:
            run_git(["commit", "-m", COMMIT_MESSAGE])

        run_git(["pull", "origin", current_branch, "--rebase"], env=git_env)
        run_git(["push", "origin", current_branch], env=git_env)
    finally:
        Path(askpass_script).unlink(missing_ok=True)

    print("\nDone!")


if __name__ == "__main__":
    main()
