"""Run: python3 plugins/arch/scripts/test_arch.py"""
import glob
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "arch.py")

NODE = """# Idea: {slug}

## Description
x

## Priority
{priority}

## Maturity
{maturity}
{extra}
## Notes

## Connections

## History
{history}
"""


def node(slug, priority, maturity, history="", extra=""):
    return NODE.format(slug=slug, priority=priority, maturity=maturity, history=history, extra=extra)


DECISION = "\n## Decision\nuse it\n"


def write(root, rel, text):
    path = os.path.join(root, ".arch", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


class ArchTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        write(self.root, "ideas/stack.md", node("stack", "blocking", "decided", extra=DECISION,
                                                history="- 2026-09-01 /arch:new — a\n- 2026-09-03 /arch:decide — b"))
        write(self.root, "ideas/sync.md", node("sync", "core", "raw-idea", "- 2026-09-05 /arch:explore — c"))
        write(self.root, "ideas/old.archived.md", node("old", "core", "explored", "- 2026-09-04 /arch:map — merged into sync"))
        self.index = {
            "project": "P", "created": "2026-09-01", "last_updated": "2026-09-01",
            "nodes": [
                {"slug": "stack", "priority": "blocking", "maturity": "decided", "file": "ideas/stack.md"},
                {"slug": "sync", "priority": "core", "maturity": "explored", "file": "ideas/sync.md"},
            ],
            "connections": [{"from": "stack", "to": "ghost", "type": "dependency"}],
            "sessions": [{"date": "2026-09-01", "skill": "new", "summary": "s"}],
        }
        write(self.root, "index.json", json.dumps(self.index))

    def run_cli(self, *args, env=None):
        r = subprocess.run([sys.executable, SCRIPT] + list(args), cwd=self.root, capture_output=True, encoding="utf-8",
                           env=dict(os.environ, **env) if env else None)
        return r.returncode, r.stdout + r.stderr

    def test_summary_derives_state_and_problems(self):
        code, out = self.run_cli("summary")
        self.assertEqual(code, 0)
        self.assertIn("nodes=2 archived=1", out)
        self.assertIn("FINALIZE_GATE closed — not ready: stack(decided); 2 problem(s)", out)
        self.assertIn("LAST_MAP never", out)
        self.assertIn("LAST_NODE_WORKED_ON sync", out)
        self.assertIn("sync: maturity differs — index 'explored', node file 'raw-idea'", out)
        self.assertIn("unknown slug 'ghost'", out)
        self.assertNotIn(" old ", out.split("PROBLEMS")[0])  # archived node is not a live node

    def test_set_updates_both_copies(self):
        code, out = self.run_cli("set", "sync", "maturity", "explored")
        self.assertEqual(code, 0, out)
        with open(os.path.join(self.root, ".arch/ideas/sync.md"), encoding="utf-8") as f:
            self.assertIn("## Maturity\nexplored\n", f.read())
        code, out = self.run_cli("set", "stack", "maturity", "ready")
        self.assertEqual(code, 0, out)
        with open(os.path.join(self.root, ".arch/index.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["nodes"][0]["maturity"], "ready")
        self.assertEqual(self.run_cli("set", "stack", "maturity", "done")[0], 1)
        code, out = self.run_cli("set", "sync", "maturity", "decided")  # no ## Decision in sync.md
        self.assertIn("no ## Decision section", out)
        self.assertEqual((code, self.index_now()["nodes"][1]["maturity"]), (1, "explored"))
        self.assertEqual(self.run_cli("set", "nope", "priority", "core")[0], 1)

    def test_log_appends_session(self):
        code, out = self.run_cli("log", "decide", "picked pg", "--node", "stack")
        self.assertEqual(code, 0, out)
        with open(os.path.join(self.root, ".arch/index.json"), encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["sessions"][-1]["node"], "stack")
        self.assertEqual(data["last_updated"], data["sessions"][-1]["date"])
        self.assertEqual(self.run_cli("log", "decide", "x", "--node", "ghost")[0], 1)
        self.assertEqual(self.run_cli("log", "status", "x")[0], 1)

    def index_now(self):
        with open(os.path.join(self.root, ".arch/index.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_connections_and_merge(self):
        self.assertEqual(self.run_cli("connect", "stack", "sync", "dependency", "db")[0], 0)
        self.assertEqual(self.run_cli("connect", "stack", "sync", "dependency", "db v2")[0], 0)  # updates, no duplicate
        self.assertEqual(self.run_cli("connect", "stack", "stack", "conflict", "x")[0], 1)
        self.assertEqual(self.run_cli("connect", "stack", "sync", "blocks", "x")[0], 1)
        self.assertEqual(self.run_cli("disconnect", "stack", "ghost")[0], 0)
        self.assertEqual(self.index_now()["connections"], [{"from": "stack", "to": "sync", "type": "dependency", "note": "db v2"}])
        # merge sync into a new node "core-sync": write file, register, archive old, repoint
        write(self.root, "ideas/core-sync.md", node("core-sync", "core", "raw-idea"))
        self.assertEqual(self.run_cli("add-node", "core-sync", "Core Sync", "core", "merged")[0], 0)
        code, out = self.run_cli("archive", "sync")
        self.assertIn("still use it", out)
        self.assertTrue(os.path.exists(os.path.join(self.root, ".arch/ideas/sync.archived.md")))
        self.assertEqual(self.run_cli("rename", "sync", "core-sync")[0], 0)
        data = self.index_now()
        self.assertEqual([n["slug"] for n in data["nodes"]], ["stack", "core-sync"])
        self.assertEqual(data["connections"][0]["to"], "core-sync")
        _, out = self.run_cli("check")
        self.assertIn("not described in either node's ## Connections", out)

    def test_init_refuses_existing_index(self):
        self.assertEqual(self.run_cli("init", "P")[0], 1)
        os.remove(os.path.join(self.root, ".arch/index.json"))
        self.assertEqual(self.run_cli("init", "P")[0], 0)
        self.assertEqual(self.index_now()["nodes"], [])

    def test_same_day_order_comes_from_sessions(self):
        # one day: explore sync, full map, decide stack — only stack changed after the map
        for args in (("explore", "--node", "sync"), ("map", "--full"), ("decide", "--node", "stack")):
            self.assertEqual(self.run_cli("log", args[0], "x", *args[1:])[0], 0)
        _, out = self.run_cli("summary")
        self.assertIn("LAST_NODE_WORKED_ON stack (", out)
        self.assertIn("— nodes changed since: stack\n", out)
        self.assertIn("(full map, revision 3, 1 sessions since)", out)

    def test_only_a_full_map_refreshes_the_graph(self):
        self.run_cli("log", "map", "full", "--full")
        self.run_cli("log", "explore", "sync changed", "--node", "sync")
        self.run_cli("log", "map", "mapped only stack", "--node", "stack")  # scoped run
        self.assertIn("nodes changed since: stack, sync\n", self.run_cli("summary")[1])
        self.run_cli("log", "map", "full again", "--full")
        self.assertIn("none (map is fresh)", self.run_cli("summary")[1])
        self.assertEqual(self.run_cli("log", "decide", "x", "--full")[0], 1)

    def test_readiness_structure_blocks_finalize(self):
        # an all-ready-looking board with a cycle, an open conflict and a missing decision
        write(self.root, "ideas/a.md", node("a", "blocking", "raw-idea", extra=""))
        write(self.root, "ideas/b.md", node("b", "core", "raw-idea", extra=DECISION))
        write(self.root, "index.json", json.dumps({"project": "P", "nodes": [
            {"slug": "a", "priority": "blocking", "maturity": "raw-idea", "file": "ideas/a.md"},
            {"slug": "b", "priority": "core", "maturity": "raw-idea", "file": "ideas/b.md"}], "sessions": []}))
        for f in ("old.archived.md", "stack.md", "sync.md"):
            os.remove(os.path.join(self.root, ".arch/ideas", f))
        self.assertEqual(self.run_cli("set", "b", "maturity", "ready")[0], 0)
        self.assertEqual(self.run_cli("set", "a", "maturity", "ready")[0], 1)  # a has no ## Decision
        for src, dst, kind in (("a", "b", "dependency"), ("b", "a", "dependency"), ("a", "b", "conflict")):
            self.assertEqual(self.run_cli("connect", src, dst, kind, "n")[0], 0)
        _, out = self.run_cli("summary")
        self.assertIn("FINALIZE_GATE closed — not ready: a(raw-idea);", out)
        self.assertIn("dependency cycle: a -> b -> a", out)
        self.assertIn("conflict a <-> b is unresolved but b is ready", out)
        self.assertIn("b is ready but depends on a (raw-idea)", out)

    def test_briefs_outdated_by_revision(self):
        self.run_cli("set", "stack", "maturity", "ready")
        brief = "# Feature Brief: X\n_Stage: 01_\n_Arch nodes covered: stack, sync_\n_Arch revision: %d_\n%s\n## Goal\n"
        write(self.root, "feature-briefs/01-x.md", brief % (1, ""))
        _, out = self.run_cli("summary")
        self.assertIn("BRIEFS_OUTDATED none", out)
        self.assertIn("READY_NOT_IN_A_BRIEF none", out)
        self.run_cli("log", "decide", "re-decided the same day", "--node", "stack")
        self.run_cli("log", "finalize", "wrote 02", "--node", "stack")  # finalize runs never outdate a brief
        _, out = self.run_cli("summary")
        self.assertIn("BRIEFS_OUTDATED 1\n  01-x.md — stack decide\n", out)
        # a follow-up bumps the old brief to the current revision; later changes to its nodes outdate it again
        write(self.root, "feature-briefs/01-x.md", brief % (3, "_Followed up by: 02-y.md (2026-10-07)_"))
        self.assertIn("BRIEFS_OUTDATED none", self.run_cli("summary")[1])
        self.run_cli("log", "decide", "x", "--node", "sync")
        self.assertIn("BRIEFS_OUTDATED 1\n  01-x.md — sync decide\n", self.run_cli("summary")[1])
        self.assertEqual(self.run_cli("archive", "sync")[0], 0)
        self.assertIn("01-x.md — sync archived", self.run_cli("summary")[1])
        # the next follow-up drops the archived node from the covered list, which clears it
        write(self.root, "feature-briefs/01-x.md", (brief % (4, "_Followed up by: 03-z.md (2026-10-07)_")).replace("stack, sync", "stack"))
        self.assertIn("BRIEFS_OUTDATED none", self.run_cli("summary")[1])
        write(self.root, "feature-briefs/01-x.md", brief % (3, "_Superseded by: 02-y.md (2026-10-07)_"))
        _, out = self.run_cli("summary")
        self.assertIn("BRIEFS 1 written, 1 superseded", out)
        self.assertIn("READY_NOT_IN_A_BRIEF stack", out)  # a superseded brief no longer covers its nodes

    def test_follow_up_chain_reports_newest_brief(self):
        write(self.root, "feature-briefs/01-x.md", "_Arch nodes covered: stack, sync_\n_Arch revision: 1_\n_Followed up by: 02-y.md_\n")
        write(self.root, "feature-briefs/02-y.md", "_Arch nodes covered: stack_\n_Arch revision: 1_\n_Follows up: 01-x.md_\n")
        self.run_cli("log", "decide", "x", "--node", "stack")
        self.assertIn("BRIEFS_OUTDATED 1\n  02-y.md — stack decide\n", self.run_cli("summary")[1])
        self.run_cli("log", "decide", "y", "--node", "sync")  # 02 does not cover sync, so 01 still answers for it
        self.assertIn("BRIEFS_OUTDATED 2\n  01-x.md — sync decide\n  02-y.md — stack decide\n", self.run_cli("summary")[1])

    def test_archive_twice_picks_a_free_name(self):
        self.assertEqual(self.run_cli("archive", "sync")[0], 0)
        write(self.root, "ideas/sync.md", node("sync", "core", "raw-idea"))
        self.assertEqual(self.run_cli("add-node", "sync", "Sync", "core", "again")[0], 0)
        code, out = self.run_cli("archive", "sync")
        self.assertEqual(code, 0, out)
        self.assertIn("sync-2.archived.md", out)
        _, out = self.run_cli("summary")
        self.assertIn("archived=3", out)
        self.assertNotIn("not in index.json", out)

    def test_non_utf8_stdout(self):
        self.assertEqual(self.run_cli("set", "sync", "summary", "Вибір стеку")[0], 0)
        code, out = self.run_cli("summary", env={"PYTHONIOENCODING": "cp1252"})
        self.assertEqual(code, 0, out)
        self.assertIn("Вибір стеку", out)

    def test_schema_and_slug_validation(self):
        write(self.root, "index.json", json.dumps({"nodes": "broken"}))
        code, out = self.run_cli("summary")
        self.assertEqual((code, out.split(" ")[0]), (0, "INDEX_INVALID"), out)
        self.assertEqual(self.run_cli("set", "stack", "priority", "core")[0], 1)
        self.index["nodes"].append(dict(self.index["nodes"][0]))
        write(self.root, "index.json", json.dumps(self.index))
        self.assertIn("stack: slug is used by more than one node", self.run_cli("check")[1])
        write(self.root, "ideas/Bad Slug.md", "x")
        self.assertIn("slug must be", self.run_cli("add-node", "Bad Slug", "B", "core", "x")[1])

    def test_bracketed_history_date_and_unregistered_file(self):
        write(self.root, "ideas/sync.md", node("sync", "core", "explored", "- [2026-09-06] /arch:explore — d"))
        write(self.root, "ideas/stray.md", "# Idea: stray\n")
        _, out = self.run_cli("summary")
        self.assertIn("sync h=1", out)
        self.assertIn("ideas/stray.md: node file is not in index.json", out)

    def test_missing_node_file_is_a_clean_error(self):
        os.remove(os.path.join(self.root, ".arch/ideas/sync.md"))
        for args in (("set", "sync", "maturity", "decided"), ("archive", "sync")):
            code, out = self.run_cli(*args)
            self.assertEqual((code, out.split(":")[0]), (1, "ERROR"), out)

    def test_missing_or_broken_index_never_fails_summary(self):
        write(self.root, "index.json", "{broken")
        code, out = self.run_cli("summary")
        self.assertEqual((code, out.split(" ")[0]), (0, "INDEX_INVALID"))
        os.remove(os.path.join(self.root, ".arch/index.json"))
        code, out = self.run_cli("check")
        self.assertEqual((code, out.split(" ")[0]), (0, "NO_ARCH_SESSION"))


class SkillsTest(unittest.TestCase):
    # skills repeat these lines on purpose (see README → Development): each must exist in exactly these skills, identically
    ALL = {"new", "triage", "explore", "map", "decide", "status", "audit", "finalize"}
    WRITERS = ALL - {"status", "audit"}
    SHARED = {
        "!`python3": ALL, "- `NO_ARCH_SESSION` → stop": ALL - {"new"}, "- `STATE_SCRIPT_FAILED`": ALL, "- `INDEX_INVALID`": ALL,
        "- Otherwise take counts": ALL, "**Writing `index.json`:**": WRITERS, "- Change maturity and priority only": WRITERS,
        "- Add a `## History` line": WRITERS, "- Record every run that wrote files": WRITERS,
        "1. Its `## Decision` section": {"decide", "finalize"}, "2. No open questions remain": {"decide", "finalize"},
        "3. `## Decision → Implications`": {"decide", "finalize"}, "4. Every node it depends on": {"decide", "finalize"},
        "5. A high reversal-cost decision": {"decide", "finalize"},
    }

    def test_shared_lines_are_present_and_identical(self):
        skills = os.path.join(os.path.dirname(SCRIPT), "..", "skills", "*", "SKILL.md")
        lines = {}
        for path in glob.glob(skills):
            with open(path, encoding="utf-8") as f:
                lines[os.path.basename(os.path.dirname(path))] = f.read().splitlines()
        self.assertEqual(set(lines), self.ALL)
        for prefix, owners in self.SHARED.items():
            found = {name: [line for line in body if line.startswith(prefix)] for name, body in lines.items()}
            self.assertEqual({name for name, hits in found.items() if hits}, owners, "%r is missing from or extra in a skill" % prefix)
            variants = {line for hits in found.values() for line in hits}
            self.assertEqual(len(variants), 1, "%r differs between skills:\n%s" % (prefix, "\n".join(variants)))


if __name__ == "__main__":
    unittest.main()
