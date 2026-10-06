#!/usr/bin/env python3
"""Create an annotated git tag, and optionally a GitHub Release, for every
version in releases.json (oldest first), using the notes from CHANGELOG.md.

Run by .github/workflows/create-release-tags.yml. Safe to re-run: tags and
releases that already exist are left alone, and nothing is created unless
every target commit is present.
"""
import json
import os
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
RELEASES = json.loads((HERE / "releases.json").read_text(encoding="utf-8"))
CREATE_RELEASES = os.environ.get("CREATE_RELEASES", "true").lower() == "true"
REPO_URL = "{}/{}".format(
    os.environ.get("GITHUB_SERVER_URL", "https://github.com"),
    os.environ.get("GITHUB_REPOSITORY", ""),
)


def run(*args, stdin=None, env=None):
    result = subprocess.run(
        args, input=stdin, env=env, text=True, capture_output=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def plain(text):
    """Strip the markdown used in the notes, for plain-text tag messages."""
    return text.replace("**", "").replace("`", "")


def history_line(r):
    if r["previous_version"]:
        return f"Previously numbered {r['previous_version']}"
    return "Released before the app showed a version number"


def tag_message(r):
    lines = [f"{r['tag']} ({r['date']})", "", f"{r['type']} · {history_line(r)}"]
    if len(r["commits"]) > 1:
        lines.append("Commits: " + ", ".join(r["commits"]))
    lines.append("")
    lines += ["- " + plain(note) for note in r["notes"]]
    if r["judgement_call"]:
        lines += ["", "The type is a judgement call. See Notes in CHANGELOG.md."]
    return "\n".join(lines) + "\n"


def release_body(r):
    lines = [f"**{r['type']}** · {r['date']} · {history_line(r)}", ""]
    lines += ["- " + note for note in r["notes"]]
    lines += ["", "Commits: " + ", ".join(f"`{c}`" for c in r["commits"])]
    if r["judgement_call"]:
        lines += [
            "",
            f"_The type is a judgement call. See [Notes in the changelog]"
            f"({REPO_URL}/blob/main/CHANGELOG.md#notes)._",
        ]
    return "\n".join(lines) + "\n"


def remote_tags():
    """Map of tag name -> commit it points to, on origin."""
    tags = {}
    for line in run("git", "ls-remote", "--tags", "origin").splitlines():
        sha, ref = line.split("\t")
        name = ref[len("refs/tags/"):]
        if name.endswith("^{}"):  # peeled annotated tag: the commit itself
            tags[name[:-3]] = sha
        else:
            tags.setdefault(name, sha)
    return tags


def create_tags():
    existing = remote_tags()
    to_push = []
    for r in RELEASES:
        tag, sha = r["tag"], r["sha"]
        if tag in existing:
            if existing[tag] != sha:
                print(f"::warning::{tag} already exists on another commit; left unchanged")
            continue
        # Date the tag to its release so tags sort in release order.
        env = dict(os.environ, GIT_COMMITTER_DATE=run("git", "log", "-1", "--format=%cI", sha))
        run("git", "tag", "-f", "-a", tag, sha, "-F", "-", stdin=tag_message(r), env=env)
        to_push.append(f"refs/tags/{tag}")
    if to_push:
        run("git", "push", "origin", *to_push)
    print(f"Tags: {len(to_push)} created, {len(RELEASES) - len(to_push)} already existed")
    return len(to_push)


def create_releases():
    existing = set(
        run("gh", "release", "list", "--limit", "1000", "--json", "tagName", "--jq", ".[].tagName").split()
    )
    newest = RELEASES[-1]["tag"]
    created = 0
    for r in RELEASES:  # oldest first, so the newest ends up as "Latest"
        tag = r["tag"]
        if tag in existing:
            continue
        args = [
            "gh", "release", "create", tag, "--verify-tag", "--title", tag,
            "--notes-file", "-", f"--latest={'true' if tag == newest else 'false'}",
        ]
        for attempt in range(4):
            try:
                run(*args, stdin=release_body(r))
                break
            except RuntimeError as err:
                if attempt == 3:
                    raise
                wait = 30 * (attempt + 1)
                print(f"Release {tag} failed, retrying in {wait}s: {err}")
                time.sleep(wait)
        created += 1
        time.sleep(2)  # stay well under GitHub's content-creation rate limit
    print(f"Releases: {created} created, {len(RELEASES) - created} already existed")
    return created


def main():
    missing = [
        r["tag"] for r in RELEASES
        if subprocess.run(
            ["git", "cat-file", "-e", r["sha"] + "^{commit}"], stderr=subprocess.DEVNULL
        ).returncode != 0
    ]
    if missing:
        sys.exit("Commits not found for: " + ", ".join(missing) + ". Nothing was created.")

    run("git", "config", "user.name", "github-actions[bot]")
    run("git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com")

    tags = create_tags()
    releases = create_releases() if CREATE_RELEASES else 0

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"Created {tags} tags and {releases} releases "
                    f"for {len(RELEASES)} versions ({RELEASES[0]['tag']} to {RELEASES[-1]['tag']}).\n")


if __name__ == "__main__":
    main()
