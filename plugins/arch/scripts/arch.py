#!/usr/bin/env python3
"""Deterministic helpers for the architector skills. Owns .arch/index.json. Run from the project root.

Read (always exit 0, safe to inject into a skill):
  summary                                    state report: counts, stage, finalize gate, map and brief freshness, problems
  check                                      consistency problems only
Write (exit 1 with ERROR: on bad input, nothing written):
  init PROJECT                               create index.json (fails if it exists)
  add-node SLUG NAME PRIORITY SUMMARY        register an existing ideas/SLUG.md as a live raw-idea node
  archive SLUG                               ideas/SLUG.md -> ideas/SLUG.archived.md, drop from nodes
  set SLUG FIELD VALUE                       maturity/priority: index + node file; name/summary: index only.
                                             decided/ready need a ## Decision section in the node file
  connect FROM TO TYPE NOTE                  add or update a connection (dependency|shared-concern|conflict);
                                             for dependency, FROM must be decided before TO
  disconnect FROM TO [TYPE]                  remove matching connections
  rename OLD NEW                             repoint connections from OLD to NEW (merge/split), drop self-links and duplicates
  log SKILL SUMMARY [--node SLUG ...] [--full]  append a sessions entry, bump last_updated; --full marks a whole-graph map

index.json: {project, created, last_updated, nodes: [{slug, name, priority, maturity, file, summary}],
             connections: [{from, to, type, note}], sessions: [{date, skill, node (slug or list)?, scope?, summary}]}
Revision = number of sessions entries. A feature brief records the revision it was written at (_Arch revision: N_);
any later session that names one of its nodes makes it outdated until it is marked _Superseded by_ or _Followed up by_.

Python 3.8+, standard library only.
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys

ARCH = ".arch"
INDEX = os.path.join(ARCH, "index.json")
MATURITY = ["raw-idea", "explored", "decided", "ready"]
PRIORITY = ["blocking", "core", "extension", "deferred"]
CONNECTION_TYPES = ["dependency", "shared-concern", "conflict"]
SKILLS = ["new", "triage", "explore", "map", "decide", "finalize"]
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
BRIEF_META = re.compile(r"^_([A-Za-z ]+):\s*(.*?)_\s*$")
HISTORY_LINE = re.compile(r"^-\s*\[?(\d{4}-\d{2}-\d{2})\]?\s+/arch:([\w-]+)\s*[—–-]*\s*(.*)$")


def fail(msg):
    sys.exit("ERROR: " + msg)


def today():
    return datetime.date.today().isoformat()


def write(path, text):
    """Atomic: a crash leaves the old file, never a half-written one."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def save_index(data):
    data["last_updated"] = today()
    write(INDEX, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def sections(text):
    """'## Heading' -> list of body lines."""
    out, current = {}, None
    for line in (text or "").splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            out[current] = []
        elif current:
            out[current].append(line)
    return out


def first_value(lines):
    return next((line.strip() for line in lines or [] if line.strip()), None)


def history(path):
    """[(date, skill, text)] from a node file's ## History section."""
    found = [HISTORY_LINE.match(line.strip()) for line in sections(read(path)).get("History", [])]
    return [m.groups() for m in found if m]


def slugs_of(session):
    node = session.get("node")
    return node if isinstance(node, list) else [node] if node else []


def changed_by(session):
    """Nodes a session changed. finalize only names the nodes its briefs cover."""
    return [] if session.get("skill") == "finalize" else slugs_of(session)


def node_path(node):
    return os.path.join(ARCH, node.get("file", ""))


def schema_error(data):
    """Structural check of index.json; None when usable."""
    if not isinstance(data, dict):
        return "top level must be a JSON object"
    for key, fields in (("nodes", ("slug", "file")), ("connections", ("from", "to", "type")), ("sessions", ("date", "skill"))):
        items = data.get(key, [])
        if not isinstance(items, list) or not all(isinstance(x, dict) for x in items):
            return "%s must be a list of objects" % key
        for i, x in enumerate(items):
            missing = [f for f in fields if not isinstance(x.get(f), str)]
            if missing:
                return "%s[%d] needs string %s" % (key, i, ", ".join(missing))
    for i, s in enumerate(data.get("sessions", [])):
        node = s.get("node")
        if node is not None and not isinstance(node, str) and not (isinstance(node, list) and all(isinstance(x, str) for x in node)):
            return "sessions[%d].node must be a slug or a list of slugs" % i
    return None


def cycles(edges):
    """Each dependency cycle once, as a slug path that ends where it starts."""
    graph, found, seen, done = {}, [], set(), set()
    for a, b in edges:
        graph.setdefault(a, []).append(b)

    def visit(n, path):
        if n in path:
            loop = path[path.index(n):]
            if frozenset(loop) not in seen:
                seen.add(frozenset(loop))
                found.append(loop + [n])
        elif n not in done:
            for m in graph.get(n, []):
                visit(m, path + [n])
            done.add(n)

    for n in sorted(graph):
        visit(n, [])
    return found


def briefs():
    """[(file name, {header field: value})] for .arch/feature-briefs/*.md."""
    out = []
    for path in sorted(glob.glob(os.path.join(ARCH, "feature-briefs", "*.md"))):
        found = (BRIEF_META.match(line.strip()) for line in (read(path) or "").splitlines()[:15])
        out.append((os.path.basename(path), {m.group(1): m.group(2) for m in found if m}))
    return out


def brief_slugs(meta):
    return [s.strip() for s in meta.get("Arch nodes covered", "").split(",") if s.strip()]


def find_node(data, slug):
    node = next((n for n in data.get("nodes", []) if n.get("slug") == slug), None)
    if node is None:
        fail("no live node %r in index.json" % slug)
    return node


def problems(data):
    out = []
    files = {}
    slugs = {n.get("slug") for n in data.get("nodes", [])}
    mentions = lambda slug, lines: re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(slug), "\n".join(lines or []))
    maturity = {n.get("slug"): n.get("maturity") for n in data.get("nodes", [])}
    for slug in sorted({s for s in maturity if [n.get("slug") for n in data.get("nodes", [])].count(s) > 1}):
        out.append("%s: slug is used by more than one node" % slug)
    for node in data.get("nodes", []):
        slug, rel = node.get("slug"), node.get("file", "")
        if node.get("maturity") not in MATURITY:
            out.append("%s: index maturity %r is not one of %s" % (slug, node.get("maturity"), "/".join(MATURITY)))
        if node.get("priority") not in PRIORITY:
            out.append("%s: index priority %r is not one of %s" % (slug, node.get("priority"), "/".join(PRIORITY)))
        if rel != "ideas/%s.md" % slug:
            out.append("%s: file must be ideas/%s.md, not %r" % (slug, slug, rel))
            continue
        text = read(node_path(node))
        if text is None:
            out.append("%s: node file missing: %s" % (slug, rel))
            continue
        files[slug] = sections(text)
        for field in ("maturity", "priority"):
            in_file = first_value(files[slug].get(field.capitalize()))
            if in_file != node.get(field):
                out.append("%s: %s differs — index %r, node file %r" % (slug, field, node.get(field), in_file))
        if node.get("maturity") in ("decided", "ready") and "Decision" not in files[slug]:
            out.append("%s: %s but the node file has no ## Decision section" % (slug, node.get("maturity")))
    registered = {n.get("file") for n in data.get("nodes", [])}
    for path in sorted(glob.glob(os.path.join(ARCH, "ideas", "*.md"))):
        rel = "ideas/" + os.path.basename(path)
        if not rel.endswith(".archived.md") and rel not in registered:
            out.append("%s: node file is not in index.json — register it with add-node or remove it" % rel)
    settled = ("decided", "ready")
    for c in data.get("connections", []):
        a, b, kind = c.get("from"), c.get("to"), c.get("type")
        unknown = [s for s in (a, b) if s not in slugs]
        if unknown:
            out.append("connection %s -> %s: unknown slug %s" % (a, b, ", ".join(map(repr, unknown))))
            continue
        if kind not in CONNECTION_TYPES:
            out.append("connection %s -> %s: type %r is not one of %s" % (a, b, kind, "/".join(CONNECTION_TYPES)))
        if a in files and b in files:
            if not (mentions(b, files[a].get("Connections")) or mentions(a, files[b].get("Connections"))):
                out.append("connection %s -> %s (%s): not described in either node's ## Connections" % (a, b, kind))
        if kind == "conflict" and (maturity[a] in settled or maturity[b] in settled):
            out.append("conflict %s <-> %s is unresolved but %s — align the decisions, then disconnect" % (
                a, b, " and ".join("%s is %s" % (s, maturity[s]) for s in (a, b) if maturity[s] in settled)))
        if kind == "dependency" and maturity[b] == "ready" and maturity[a] != "ready":
            out.append("%s is ready but depends on %s (%s)" % (b, a, maturity[a]))
    deps = [(c.get("from"), c.get("to")) for c in data.get("connections", [])
            if c.get("type") == "dependency" and c.get("from") in slugs and c.get("to") in slugs]
    for loop in cycles(deps):
        out.append("dependency cycle: " + " -> ".join(loop))
    for i, s in enumerate(data.get("sessions", [])):
        if not s.get("date") or not s.get("skill"):
            out.append("sessions[%d]: missing date or skill" % i)
    return out


def stage(nodes):
    total = len(nodes) or 1
    share = lambda levels: sum(n.get("maturity") in levels for n in nodes) / total
    if share(MATURITY[2:]) > 0.5:
        return "Late"
    if share(MATURITY[1:]) > 0.5:
        return "Mid"
    return "Early"


def summary(data):
    nodes = data.get("nodes", [])
    live = [(n, history(node_path(n))) for n in nodes]
    archived = glob.glob(os.path.join(ARCH, "ideas", "*.archived.md"))
    sessions = data.get("sessions", [])
    found = problems(data)
    rank = lambda values, v: values.index(v) if v in values else len(values)
    lines = ["ARCH_SESSION project=%s created=%s last_updated=%s nodes=%d archived=%d revision=%d" % (
        data.get("project"), data.get("created"), data.get("last_updated"), len(nodes), len(archived), len(sessions))]

    total = len(nodes) or 1
    counts = [(m, sum(n.get("maturity") == m for n in nodes)) for m in MATURITY]
    lines.append("MATURITY " + " ".join("%s=%d(%d%%)" % (m, c, round(100 * c / total)) for m, c in counts))
    lines.append("STAGE %s" % stage(nodes))

    lines.append("NODES priority maturity slug h=history-lines — summary")
    hist = {n.get("slug"): h for n, h in live}
    for n in sorted(nodes, key=lambda n: (rank(PRIORITY, n.get("priority")), rank(MATURITY, n.get("maturity")), n.get("slug", ""))):
        lines.append("  %-9s %-8s %s h=%d — %s" % (n.get("priority"), n.get("maturity"), n.get("slug"),
                                                  len(hist.get(n.get("slug"), [])), n.get("summary", "")))

    blocking = [n for n in nodes if n.get("priority") == "blocking" and n.get("maturity") != "ready"]
    reasons = (["not ready: " + ", ".join("%s(%s)" % (n.get("slug"), n.get("maturity")) for n in blocking)] if blocking else []) + (
        ["%d problem(s), see PROBLEMS" % len(found)] if found else [])
    lines.append("FINALIZE_GATE " + ("closed — " + "; ".join(reasons) if reasons else
                                     "open — every blocking node is ready and there are no problems"))
    rest = [n.get("slug") for n in nodes if n.get("priority") != "blocking" and n.get("maturity") != "ready"]
    if rest:
        lines.append("NOT_READY_NON_BLOCKING " + ", ".join(rest))

    conns = data.get("connections", [])
    lines.append("CONNECTIONS %d" % len(conns))
    lines += ["  %s -> %s (%s)" % (c.get("from"), c.get("to"), c.get("type")) for c in conns]

    # only a full map makes the whole graph fresh; sessions are in run order, so everything after it is newer
    full_maps = [i for i, s in enumerate(sessions) if s.get("skill") == "map" and s.get("scope") == "full"]
    if full_maps:
        last = full_maps[-1]
        changed = sorted({slug for s in sessions[last + 1:] for slug in changed_by(s)} & set(hist))
        lines.append("LAST_MAP %s (full map, revision %d) — nodes changed since: %s" % (
            sessions[last].get("date"), last + 1, ", ".join(changed) or "none (map is fresh)"))
    else:
        lines.append("LAST_MAP never — no full /arch:map yet")

    written = briefs()
    active = [(name, meta) for name, meta in written if "Superseded by" not in meta]
    covered = {slug for _, meta in active for slug in brief_slugs(meta)}
    if written:
        lines.append("BRIEFS %d written, %d superseded" % (len(written), len(written) - len(active)))
        outdated = []
        for name, meta in active:
            if "Followed up by" in meta:
                continue
            rev = meta.get("Arch revision", "")
            later = sessions[int(rev):] if rev.isdigit() else sessions
            why = ["%s archived" % slug if slug not in hist else "%s %s" % (slug, "+".join(skills))
                   for slug in brief_slugs(meta)
                   for skills in [sorted({s.get("skill") for s in later if slug in changed_by(s)})]
                   if slug not in hist or skills]
            if why:
                outdated.append("  %s — %s" % (name, ", ".join(why)))
        lines.append("BRIEFS_OUTDATED " + (str(len(outdated)) if outdated else "none"))
        lines += outdated
    uncovered = [n.get("slug") for n in nodes if n.get("maturity") == "ready" and n.get("slug") not in covered]
    lines.append("READY_NOT_IN_A_BRIEF " + (", ".join(uncovered) or "none"))

    if sessions:
        last = sessions[-1]
        lines.append("LAST_SESSION %s %s%s" % (last.get("date"), last.get("skill"),
                                               " node=%s" % ",".join(slugs_of(last)) if slugs_of(last) else ""))
    # History lines from different nodes on the same day have no order; within one file, later lines are newer
    events = sorted(reversed([(d, skill, n.get("slug"), text) for n, h in live for d, skill, text in h]),
                    key=lambda e: e[0], reverse=True)
    worked = next((s for s in reversed(sessions) if changed_by(s)), None)
    if worked:
        lines.append("LAST_NODE_WORKED_ON %s (%s %s)" % (",".join(changed_by(worked)), worked.get("date"), worked.get("skill")))
    elif events:
        lines.append("LAST_NODE_WORKED_ON %s (%s %s)" % (events[0][2], events[0][0], events[0][1]))
    if events:
        lines.append("RECENT_HISTORY newest first")
        lines += ["  %s %s %s — %s" % e for e in events[:8]]

    lines.append("PROBLEMS " + ("none" if not found else str(len(found))))
    lines += ["  - " + p for p in found]
    return "\n".join(lines)


def set_section(path, heading, value):
    text = read(path)
    if text is None:
        fail("node file missing: %s" % path)
    lines = text.split("\n")
    try:
        i = next(k for k, line in enumerate(lines) if line.strip() == "## " + heading)
    except StopIteration:
        fail("%s has no '## %s' section" % (path, heading))
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j < len(lines) and not lines[j].startswith("#"):
        lines[j] = value
    else:
        lines.insert(i + 1, value)
    write(path, "\n".join(lines))


def cmd_init(data, a):
    if data is not None:
        fail("%s already exists" % INDEX)
    os.makedirs(os.path.join(ARCH, "ideas"), exist_ok=True)
    save_index({"project": a.project, "created": today(), "last_updated": today(),
                "nodes": [], "connections": [], "sessions": []})
    return "OK created %s" % INDEX


def cmd_add_node(data, a):
    if not SLUG.match(a.slug):
        fail("slug must be lowercase words joined by hyphens, e.g. tech-stack")
    if a.priority not in PRIORITY:
        fail("priority must be one of %s" % ", ".join(PRIORITY))
    if any(n.get("slug") == a.slug for n in data["nodes"]):
        fail("node %r already exists" % a.slug)
    rel = "ideas/%s.md" % a.slug
    if read(os.path.join(ARCH, rel)) is None:
        fail("write %s/%s first" % (ARCH, rel))
    data["nodes"].append({"slug": a.slug, "name": a.name, "priority": a.priority, "maturity": "raw-idea",
                          "file": rel, "summary": a.summary})
    save_index(data)
    return "OK added node %s" % a.slug


def cmd_archive(data, a):
    node = find_node(data, a.slug)
    src = node_path(node)
    dst = os.path.join(ARCH, "ideas", "%s.archived.md" % a.slug)
    if not os.path.isfile(src):
        fail("node file missing: %s" % src)
    if os.path.exists(dst):
        fail("%s already exists" % dst)
    os.rename(src, dst)
    data["nodes"].remove(node)
    save_index(data)
    left = [c for c in data.get("connections", []) if a.slug in (c.get("from"), c.get("to"))]
    hint = " — %d connection(s) still use it: run rename or disconnect" % len(left) if left else ""
    return "OK archived %s -> %s%s" % (a.slug, dst, hint)


def cmd_set(data, a):
    node = find_node(data, a.slug)
    if a.field in ("maturity", "priority"):
        allowed = MATURITY if a.field == "maturity" else PRIORITY
        if a.value not in allowed:
            fail("%s must be one of %s" % (a.field, ", ".join(allowed)))
        if a.value in ("decided", "ready") and "Decision" not in sections(read(node_path(node))):
            fail("%s has no ## Decision section — write the decision into the node file before setting %s"
                 % (node_path(node), a.value))
        set_section(node_path(node), a.field.capitalize(), a.value)
    old = node.get(a.field)
    node[a.field] = a.value
    save_index(data)
    return "OK %s %s: %s -> %s" % (a.slug, a.field, old, a.value)


def cmd_connect(data, a):
    if a.type not in CONNECTION_TYPES:
        fail("type must be one of %s" % ", ".join(CONNECTION_TYPES))
    if a.src == a.dst:
        fail("a node cannot connect to itself")
    find_node(data, a.src), find_node(data, a.dst)
    conns = data.setdefault("connections", [])
    same = next((c for c in conns if (c.get("from"), c.get("to"), c.get("type")) == (a.src, a.dst, a.type)), None)
    if same:
        same["note"] = a.note
        verb = "updated"
    else:
        conns.append({"from": a.src, "to": a.dst, "type": a.type, "note": a.note})
        verb = "added"
    save_index(data)
    return "OK %s connection %s -> %s (%s)" % (verb, a.src, a.dst, a.type)


def cmd_disconnect(data, a):
    conns = data.get("connections", [])
    keep = [c for c in conns if not (c.get("from") == a.src and c.get("to") == a.dst and a.type in (None, c.get("type")))]
    if len(keep) == len(conns):
        fail("no connection %s -> %s%s" % (a.src, a.dst, " (%s)" % a.type if a.type else ""))
    data["connections"] = keep
    save_index(data)
    return "OK removed %d connection(s)" % (len(conns) - len(keep))


def cmd_rename(data, a):
    find_node(data, a.new)
    out, seen, moved = [], set(), 0
    for c in data.get("connections", []):
        c = dict(c)
        for end in ("from", "to"):
            if c.get(end) == a.old:
                c[end] = a.new
                moved += 1
        key = (c.get("from"), c.get("to"), c.get("type"))
        if c.get("from") != c.get("to") and key not in seen:
            seen.add(key)
            out.append(c)
    data["connections"] = out
    save_index(data)
    return "OK repointed %d connection end(s) from %s to %s; %d connection(s) remain" % (moved, a.old, a.new, len(out))


def cmd_log(data, a):
    if a.skill not in SKILLS:
        fail("skill must be one of %s" % ", ".join(SKILLS))
    if a.full and a.skill != "map":
        fail("--full is only for a whole-graph /arch:map")
    for slug in a.node:
        find_node(data, slug)
    entry = {"date": today(), "skill": a.skill}
    if a.node:
        entry["node"] = a.node[0] if len(a.node) == 1 else a.node
    if a.full:
        entry["scope"] = "full"
    entry["summary"] = a.summary
    data.setdefault("sessions", []).append(entry)
    save_index(data)
    return "OK logged " + json.dumps(entry, ensure_ascii=False)


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("summary")
    sub.add_parser("check")
    sub.add_parser("init").add_argument("project")
    s = sub.add_parser("add-node")
    for arg in ("slug", "name", "priority", "summary"):
        s.add_argument(arg)
    sub.add_parser("archive").add_argument("slug")
    s = sub.add_parser("set")
    s.add_argument("slug")
    s.add_argument("field", choices=["maturity", "priority", "name", "summary"])
    s.add_argument("value")
    s = sub.add_parser("connect")
    for arg in ("src", "dst", "type", "note"):
        s.add_argument(arg)
    s = sub.add_parser("disconnect")
    s.add_argument("src")
    s.add_argument("dst")
    s.add_argument("type", nargs="?")
    s = sub.add_parser("rename")
    s.add_argument("old")
    s.add_argument("new")
    s = sub.add_parser("log")
    s.add_argument("skill")
    s.add_argument("summary")
    s.add_argument("--node", action="append", default=[])
    s.add_argument("--full", action="store_true")
    return p


def main(argv):
    a = parser().parse_args(argv)
    reading = a.cmd in ("summary", "check")
    data = None
    if os.path.isfile(INDEX):
        try:
            with open(INDEX, encoding="utf-8") as f:
                data = json.load(f)
        except ValueError as e:
            print("INDEX_INVALID — %s is not valid JSON: %s" % (INDEX, e))
            sys.exit(0 if reading else 1)
        err = schema_error(data)
        if err:
            print("INDEX_INVALID — %s: %s" % (INDEX, err))
            sys.exit(0 if reading else 1)
    elif a.cmd != "init":
        print("NO_ARCH_SESSION — %s not found in %s" % (INDEX, os.getcwd()))
        sys.exit(0 if reading else 1)
    if a.cmd == "summary":
        print(summary(data))
    elif a.cmd == "check":
        found = problems(data)
        print("PROBLEMS none" if not found else "\n".join(["PROBLEMS %d" % len(found)] + ["  - " + p for p in found]))
    else:
        print(globals()["cmd_" + a.cmd.replace("-", "_")](data, a))


if __name__ == "__main__":
    main(sys.argv[1:])
