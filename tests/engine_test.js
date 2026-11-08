// Tests for engine.js (run.sh). `t.eq(got, expected, what)`, `t.ok(v, what)`.
var E = Engine;
var area = E.rect(0, 0, 1000, 600);

// dwindle: halves along the longer side, gap between
var s = E.newSurface("dwindle");
["a", "b", "c"].forEach(function (id) { E.addTile(s, id, s.order[s.order.length - 1]); });
var r = E.layout(s, area, 10).rects;
t.eq(r.a, E.rect(0, 0, 495, 600), "dwindle a: left half");
t.eq(r.b, E.rect(505, 0, 495, 295), "dwindle b: top right");
t.eq(r.c, E.rect(505, 305, 495, 295), "dwindle c: bottom right");

// a new tile splits the active one (dwindle)
var s2 = E.newSurface("dwindle");
E.addTile(s2, "a", null); E.addTile(s2, "b", "a"); E.addTile(s2, "c", "a");
t.eq(s2.order, ["a", "c", "b"], "dwindle inserts after the active tile");
var s3 = E.newSurface("master");
E.addTile(s3, "a", null); E.addTile(s3, "b", "a"); E.addTile(s3, "c", "a");
t.eq(s3.order, ["a", "b", "c"], "master appends");

// master: 55% left, stack equal on the right
r = E.layout(s3, area, 0).rects;
t.eq(r.a.width, 550, "master width");
t.eq([r.b.y, r.b.height, r.c.y, r.c.height], [0, 300, 300, 300], "stack equal");

// columns and monocle
var c = E.newSurface("columns"); c.order = ["a", "b", "c", "d"];
r = E.layout(c, area, 0).rects;
t.eq([r.a.width, r.b.x, r.d.x], [250, 250, 750], "columns equal");
var m = E.newSurface("monocle"); m.order = ["a", "b"];
r = E.layout(m, area, 10).rects;
t.eq([r.a, r.b], [area, area], "monocle: all fill the area");

// one tile fills the area; none: nothing
var one = E.newSurface("dwindle"); one.order = ["a"];
t.eq(E.layout(one, area, 10).rects.a, area, "sole tile fills");
t.eq(E.layout(E.newSurface(), area, 10).rects, {}, "empty surface");

// gaps at the edges
t.eq(E.inset(E.rect(0, 34, 1920, 1046), { top: 10, right: 10, bottom: 10, left: 10 }), E.rect(10, 44, 1900, 1026), "inset");

// resize: grow a by 100 -> its right edge moves; b shrinks
var rz = E.newSurface("dwindle"); rz.order = ["a", "b"];
t.ok(E.resize(rz, area, 0, "a", "w", 100, null), "resize a");
r = E.layout(rz, area, 0).rects;
t.eq([r.a.width, r.b.x, r.b.width], [600, 600, 400], "a grew to the right");
// b grows: its left edge moves left
t.ok(E.resize(rz, area, 0, "b", "w", 100, null), "resize b");
t.eq(E.layout(rz, area, 0).rects.b.width, 500, "b grew to the left");
// clamped at 10%..90%
E.resize(rz, area, 0, "a", "w", 5000, null);
t.eq(E.layout(rz, area, 0).rects.a.width, 900, "clamped at 90%");
// no vertical split: height cannot change
t.ok(!E.resize(rz, area, 0, "a", "h", 50, null), "no split along h");
// mouse: only the dragged edge counts
var me = E.newSurface("dwindle"); me.order = ["a", "b"];
t.ok(!E.resize(me, area, 0, "a", "w", 50, "start"), "a has no split on its left");
t.ok(E.resize(me, area, 0, "a", "w", 50, "end"), "a's right edge");

// toggle split: dwindle's own node flips
var ts = E.newSurface("dwindle"); ts.order = ["a", "b"];
t.ok(E.toggleSplit(ts, area, 0, "b"), "toggle");
r = E.layout(ts, area, 0).rects;
t.eq([r.a.height, r.b.y], [300, 300], "split now horizontal");

// swap and directions
var sw = E.newSurface("dwindle"); sw.order = ["a", "b", "c"];
r = E.layout(sw, area, 0).rects;
t.eq(E.neighbor(r, "a", "right"), "b", "right of a: top right (nearest centre)");
t.eq(E.neighbor(r, "c", "up"), "b", "up from c");
t.eq(E.neighbor(r, "b", "left"), "a", "left of b");
t.eq(E.neighbor(r, "a", "left"), null, "nothing left of a");
t.ok(E.swapTiles(sw, "a", "c"), "swap");
t.eq(sw.order, ["c", "b", "a"], "swapped");
t.eq(E.tileAt(r, 700, 500, null), "c", "tile at a point");
t.eq(E.tileAt(r, 700, 500, "c"), null, "except itself");

// layouts cycle
var cy = E.newSurface("dwindle");
t.eq([E.cycleLayout(cy, 1), E.cycleLayout(cy, 1), E.cycleLayout(cy, 1), E.cycleLayout(cy, 1), E.cycleLayout(cy, -1)],
    ["master", "columns", "monocle", "dwindle", "monocle"], "cycle");

// window limit: next desktop with room, wrapping; none: stay
var lim = function (i) { return i === 3 ? 1 : 2; };
t.eq(E.overflowTarget(1, [0, 3, 0, 0], lim), 2, "to 2");
t.eq(E.overflowTarget(2, [0, 0, 3, 1], lim), 1, "3 full: wraps to 1");
t.eq(E.overflowTarget(1, [0, 2, 0, 0], lim), null, "at the limit: stays");
t.eq(E.overflowTarget(1, [0, 3, 2, 1], lim), null, "no room anywhere");
t.eq(E.parseLimits("1:2, 3:3,x:1,4:9"), { 1: 2, 3: 3, 4: 4 }, "limits parsed");
t.eq(E.parseIndexList("3, 5,,x"), [3, 5], "index list");
