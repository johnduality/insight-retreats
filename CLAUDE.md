# Insight Retreats — notes for Claude

## Warning: file writes in this folder can silently corrupt

On 2026-07-16, three separate `Edit` tool calls against `public/` silently damaged files: `styles.css` was truncated mid-rule (losing the trailing footer and media-query blocks), and `index.html` was twice mangled — once padded with 66 trailing NUL bytes after `</html>`, once truncated at a fixed 5756-byte boundary that discarded the closing `<script>`/`</body>`/`</html>` tags. Each call reported success, and the damage was only caught by re-reading the bytes afterward. Every write performed through `bash`/python in the same session persisted correctly, and `git checkout` failed with `unable to unlink ... Operation not permitted`, which suggests the fault is in the mount layer rather than in git or the editor logic specifically — the `Edit` tool may simply be the path that happens to trip it, so do not assume `Write` is safe either. Practical guidance: prefer `bash` heredoc/python writes for anything in this repo; restore files in place with `open(path,'r+b')` + `truncate()` rather than deleting them, since unlink is blocked; and after any write, verify with a byte-level check (`len(d)`, `d.count(b'\x00')`, and confirm the file ends where it should) instead of trusting the tool's success message. If a file ends mid-word or mid-rule, this is the cause and not a source-code error — recover from git history where possible, which is also why uncommitted work here is worth committing early.

## Update 2026-07-16: expansion.txt truncation, and git writes are now unsafe here too

Confirmed the same corruption pattern hit `expansion.txt` (a plain top-level file, not
`public/`): a prior session's write left it truncated mid-word at item 15 of the
expansion plan, with no error surfaced. Recovered by diffing against the last commit
(`git show <sha>:expansion.txt`) and reconciling the missing sections against the real
state of `data/centers/`; see the RECOVERY NOTE inside `expansion.txt` itself.

New finding: `git add -A` in this session corrupted `.git/index` itself (zeroed to all
NUL bytes, "bad signature 0x00000000") and left a `.git/index.lock` that can't be
removed (`Operation not permitted`, same as the unlink issue above). The corrupt index
was repairable in place — build a clean index elsewhere with
`GIT_INDEX_FILE=/tmp/x git read-tree HEAD`, then copy those bytes into `.git/index`
with `open(path,'r+b')` + `write` + `truncate()` (no unlink/rename) — but the stale
`index.lock` permanently blocks any further `git add`/`git commit` in this session
(fails cleanly with "Unable to create .git/index.lock: File exists", at least — it
doesn't corrupt anything further). **Practical guidance: do not attempt `git add` /
`git commit` / `git checkout` from this sandboxed session at all.** Leave the working
tree in a clean, verified state and tell the user to commit from their own git client
(GitHub Desktop, terminal, etc. on their actual machine) instead, since that runs
outside the broken mount layer. `git status`/`git log`/`git diff` (read-only) are fine
to use for inspection as long as no lockfile is already present from a prior failed
write.
