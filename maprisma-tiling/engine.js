// Maprisma Tiling engine: the layouts and the operations on them, without
// KWin (tiling.qml.in is the KWin side; tests/run.qml tests this file).
//
// A surface is one desktop on one screen. Its `order` lists tiles; a tile is a
// window id or a group id ("g1"): a group shows one of its windows at a time
// in one tile, with a tab bar (Omarchy's groups). Layouts are binary split
// trees built from the order:
//   dwindle  each tile splits the rest along the longer side (Hyprland's default)
//   master   one tile on the left, the others stacked on the right
//   columns  side by side
//   monocle  every tile takes the whole area (the active one on top)
// Split ratios and split directions are kept per node key, so resizing and
// "toggle split" survive a relayout.

var Engine = (function () {
    "use strict";

    var LAYOUTS = ["dwindle", "master", "columns", "monocle"];
    var MIN_RATIO = 0.1, MAX_RATIO = 0.9;

    function rect(x, y, w, h) {
        return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function newSurface(layout) {
        return { layout: LAYOUTS.indexOf(layout) >= 0 ? layout : "dwindle", order: [], ratios: {}, dirs: {} };
    }

    // Splits r in two along dir ("v": side by side, "h": one above the
    // other) at ratio t, leaving `gap` between the parts.
    function split(r, dir, t, gap) {
        if (dir === "v") {
            var aw = Math.round((r.width - gap) * t);
            return [rect(r.x, r.y, aw, r.height), rect(r.x + aw + gap, r.y, r.width - aw - gap, r.height)];
        }
        var ah = Math.round((r.height - gap) * t);
        return [rect(r.x, r.y, r.width, ah), rect(r.x, r.y + ah + gap, r.width, r.height - ah - gap)];
    }

    // A chain: tiles from..to-1 one after another along dir, equal by
    // default (node key prefix + index).
    function chain(s, tiles, from, r, dir, prefix, gap, out) {
        var n = tiles.length;
        if (from >= n) return;
        if (from === n - 1) { out.rects[tiles[from]] = r; return; }
        var key = prefix + from;
        var t = s.ratios[key] !== undefined ? s.ratios[key] : 1 / (n - from);
        var parts = split(r, dir, t, gap);
        out.nodes.push({ key: key, dir: dir, rect: r, ratio: t, a: [tiles[from]], b: tiles.slice(from + 1) });
        out.rects[tiles[from]] = parts[0];
        chain(s, tiles, from + 1, parts[1], dir, prefix, gap, out);
    }

    function dwindle(s, tiles, i, r, gap, out) {
        var n = tiles.length;
        if (i === n - 1) { out.rects[tiles[i]] = r; return; }
        var key = "d" + i;
        var dir = s.dirs[key] || (r.width >= r.height ? "v" : "h");
        var t = s.ratios[key] !== undefined ? s.ratios[key] : 0.5;
        var parts = split(r, dir, t, gap);
        out.nodes.push({ key: key, dir: dir, rect: r, ratio: t, a: [tiles[i]], b: tiles.slice(i + 1) });
        out.rects[tiles[i]] = parts[0];
        dwindle(s, tiles, i + 1, parts[1], gap, out);
    }

    // {rects: {tile: rect}, nodes: [{key, dir, rect, ratio, a, b}]} for the
    // surface's tiles in `area` (gaps at the edges already taken off).
    function layout(s, area, gap) {
        var out = { rects: {}, nodes: [] };
        var tiles = s.order;
        if (!tiles.length) return out;
        switch (s.layout) {
        case "monocle":
            tiles.forEach(function (t) { out.rects[t] = rect(area.x, area.y, area.width, area.height); });
            break;
        case "columns":
            chain(s, tiles, 0, area, "v", "c", gap, out);
            break;
        case "master":
            if (tiles.length === 1) { out.rects[tiles[0]] = area; break; }
            var dir = s.dirs.m || "v";
            var t = s.ratios.m !== undefined ? s.ratios.m : 0.55;
            var parts = split(area, dir, t, gap);
            out.nodes.push({ key: "m", dir: dir, rect: area, ratio: t, a: [tiles[0]], b: tiles.slice(1) });
            out.rects[tiles[0]] = parts[0];
            chain(s, tiles, 1, parts[1], dir === "v" ? "h" : "v", "s", gap, out);
            break;
        default:
            dwindle(s, tiles, 0, area, gap, out);
        }
        return out;
    }

    // The area left for tiles: the work area less the screen gaps.
    function inset(area, gaps) {
        return rect(area.x + gaps.left, area.y + gaps.top,
            area.width - gaps.left - gaps.right, area.height - gaps.top - gaps.bottom);
    }

    // --- order -------------------------------------------------------------

    // New tiles: dwindle splits the active tile (it goes right after it),
    // the others append, as Hyprland does.
    function addTile(s, tile, activeTile) {
        if (s.order.indexOf(tile) >= 0) return;
        var at = s.layout === "dwindle" ? s.order.indexOf(activeTile) : -1;
        if (at >= 0) s.order.splice(at + 1, 0, tile);
        else s.order.push(tile);
    }

    function removeTile(s, tile) {
        var i = s.order.indexOf(tile);
        if (i >= 0) s.order.splice(i, 1);
        return i >= 0;
    }

    function swapTiles(s, a, b) {
        var i = s.order.indexOf(a), j = s.order.indexOf(b);
        if (i < 0 || j < 0 || i === j) return false;
        s.order[i] = b;
        s.order[j] = a;
        return true;
    }

    function cycleLayout(s, step) {
        var i = LAYOUTS.indexOf(s.layout);
        s.layout = LAYOUTS[(i + step + LAYOUTS.length) % LAYOUTS.length];
        return s.layout;
    }

    // --- resizing ----------------------------------------------------------

    // The tile grows (delta > 0) or shrinks along axis "w" or "h" by delta
    // pixels. edge "end" moves its right/bottom edge, "start" its left/top
    // edge, null: the nearest split, right/bottom first (Hyprland's
    // resizeactive). Returns true when a ratio changed.
    function resize(s, area, gap, tile, axis, delta, edge) {
        var dir = axis === "w" ? "v" : "h";
        var nodes = layout(s, area, gap).nodes.filter(function (n) { return n.dir === dir; });
        // innermost first: the deepest node holding the tile
        nodes.reverse();
        for (var k = 0; k < nodes.length; k++) {
            var n = nodes[k];
            var inA = n.a.indexOf(tile) >= 0, inB = n.b.indexOf(tile) >= 0;
            if (!inA && !inB) continue;
            if (edge === "end" && !inA) continue;
            if (edge === "start" && !inB) continue;
            var size = (dir === "v" ? n.rect.width : n.rect.height) - gap;
            if (size <= 0) return false;
            var t = clamp(n.ratio + (inA ? delta : -delta) / size, MIN_RATIO, MAX_RATIO);
            if (Math.abs(t - n.ratio) < 1e-6) return false;
            s.ratios[n.key] = t;
            return true;
        }
        return false;
    }

    // Super+J: flips the split the tile starts (dwindle) or the master split.
    function toggleSplit(s, area, gap, tile) {
        var nodes = layout(s, area, gap).nodes;
        var own = null;
        for (var k = nodes.length - 1; k >= 0; k--) {
            if (nodes[k].a.indexOf(tile) >= 0 || nodes[k].b.indexOf(tile) >= 0) { own = nodes[k]; break; }
        }
        if (!own) return false;
        if (s.layout === "master" || s.layout === "columns") own = nodes[0];
        var key = s.layout === "columns" ? null : own.key;
        if (!key) return false;
        s.dirs[key] = own.dir === "v" ? "h" : "v";
        return true;
    }

    // --- directions --------------------------------------------------------

    // The id in `rects` next to `from` in direction "left"/"right"/"up"/"down":
    // the nearest one whose centre lies that way, preferring ones that
    // overlap `from` across the direction.
    function neighbor(rects, from, direction) {
        var a = rects[from];
        if (!a) return null;
        var ax = a.x + a.width / 2, ay = a.y + a.height / 2;
        var best = null, bestScore = Infinity;
        Object.keys(rects).forEach(function (id) {
            if (id === from) return;
            var b = rects[id];
            var bx = b.x + b.width / 2, by = b.y + b.height / 2;
            var dx = bx - ax, dy = by - ay, along, across, overlap;
            switch (direction) {
            case "left": along = -dx; across = Math.abs(dy); overlap = b.y < a.y + a.height && b.y + b.height > a.y; break;
            case "right": along = dx; across = Math.abs(dy); overlap = b.y < a.y + a.height && b.y + b.height > a.y; break;
            case "up": along = -dy; across = Math.abs(dx); overlap = b.x < a.x + a.width && b.x + b.width > a.x; break;
            default: along = dy; across = Math.abs(dx); overlap = b.x < a.x + a.width && b.x + b.width > a.x;
            }
            if (along <= 1) return;
            var score = along + across * 2 + (overlap ? 0 : 100000);
            if (score < bestScore) { bestScore = score; best = id; }
        });
        return best;
    }

    // The tile whose rect holds the point, or null.
    function tileAt(rects, x, y, except) {
        var hit = null;
        Object.keys(rects).forEach(function (id) {
            var r = rects[id];
            if (id !== except && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) hit = id;
        });
        return hit;
    }

    // --- window limit ------------------------------------------------------

    // Where a new tile on desktop `source` goes when it is over its limit:
    // the next desktop (wrapping) with room, or null (stay). counts: tiles per
    // desktop index 1..n; limitOf(i): the limit there.
    function overflowTarget(source, counts, limitOf) {
        var n = counts.length - 1;
        if ((counts[source] || 0) <= limitOf(source)) return null;
        for (var k = 1; k < n; k++) {
            var i = (source - 1 + k) % n + 1;
            if ((counts[i] || 0) < limitOf(i)) return i;
        }
        return null;
    }

    // "1:2,3:3" -> {1: 2, 3: 3}
    function parseLimits(text) {
        var out = {};
        String(text || "").split(",").forEach(function (part) {
            var kv = part.split(":");
            var k = parseInt(kv[0], 10), v = parseInt(kv[1], 10);
            if (k >= 1 && v >= 1) out[k] = clamp(v, 1, 4);
        });
        return out;
    }

    function parseIndexList(text) {
        var out = [];
        String(text || "").split(",").forEach(function (p) {
            var i = parseInt(p, 10);
            if (i >= 1) out.push(i);
        });
        return out;
    }

    return {
        LAYOUTS: LAYOUTS, rect: rect, clamp: clamp, newSurface: newSurface, layout: layout, inset: inset,
        addTile: addTile, removeTile: removeTile, swapTiles: swapTiles, cycleLayout: cycleLayout,
        resize: resize, toggleSplit: toggleSplit, neighbor: neighbor, tileAt: tileAt,
        overflowTarget: overflowTarget, parseLimits: parseLimits, parseIndexList: parseIndexList,
    };
})();
