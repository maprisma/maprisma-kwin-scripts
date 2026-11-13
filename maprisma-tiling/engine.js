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

    // order: the tiles in layout order. tree: dwindle's split tree, kept in
    // step with order ({tile} leaves, {key, a, b} splits; a split's ratio
    // and direction live in ratios[key] / dirs[key]).
    function newSurface(layout) {
        return { layout: LAYOUTS.indexOf(layout) >= 0 ? layout : "dwindle", order: [], ratios: {}, dirs: {},
            tree: null, next: 0 };
    }

    function leaves(node, out) {
        out = out || [];
        if (!node) return out;
        if (node.tile !== undefined) out.push(node.tile);
        else { leaves(node.a, out); leaves(node.b, out); }
        return out;
    }

    // The tree as a chain of the order (a surface used with another layout
    // until now, or tiles the tree does not know).
    function syncTree(s) {
        var known = leaves(s.tree);
        if (known.length === s.order.length && known.every(function (t) { return s.order.indexOf(t) >= 0; })) return;
        s.tree = null;
        for (var i = s.order.length - 1; i >= 0; i--) {
            var leaf = { tile: s.order[i] };
            s.tree = s.tree ? { key: "d" + (s.next++), a: leaf, b: s.tree } : leaf;
        }
    }

    // Replaces the leaf holding `tile` by what fn returns (null: removed).
    function replaceLeaf(node, tile, fn) {
        if (!node) return node;
        if (node.tile !== undefined) return node.tile === tile ? fn(node) : node;
        var a = replaceLeaf(node.a, tile, fn), b = replaceLeaf(node.b, tile, fn);
        if (!a) return b;
        if (!b) return a;
        node.a = a;
        node.b = b;
        return node;
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

    // Lays out a dwindle (sub)tree; a split with nothing shown on one side
    // gives the other side all of it.
    function dwindle(s, node, r, gap, shown, out) {
        if (!node) return;
        if (node.tile !== undefined) {
            if (shown(node.tile)) out.rects[node.tile] = r;
            return;
        }
        var la = leaves(node.a).filter(shown), lb = leaves(node.b).filter(shown);
        if (!la.length) return dwindle(s, node.b, r, gap, shown, out);
        if (!lb.length) return dwindle(s, node.a, r, gap, shown, out);
        var dir = s.dirs[node.key] || (r.width >= r.height ? "v" : "h");
        var t = s.ratios[node.key] !== undefined ? s.ratios[node.key] : 0.5;
        var parts = split(r, dir, t, gap);
        out.nodes.push({ key: node.key, dir: dir, rect: r, ratio: t, a: la, b: lb });
        dwindle(s, node.a, parts[0], gap, shown, out);
        dwindle(s, node.b, parts[1], gap, shown, out);
    }

    // {rects: {tile: rect}, nodes: [{key, dir, rect, ratio, a, b}]} for the
    // surface's tiles in `area` (gaps at the edges already taken off).
    // shown(tile): whether the tile takes part (hidden windows do not).
    function layout(s, area, gap, shown) {
        shown = shown || function () { return true; };
        var out = { rects: {}, nodes: [] };
        var tiles = s.order.filter(shown);
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
            syncTree(s);
            dwindle(s, s.tree, area, gap, shown, out);
        }
        return out;
    }

    // The area left for tiles: the work area less the screen gaps.
    function inset(area, gaps) {
        return rect(area.x + gaps.left, area.y + gaps.top,
            area.width - gaps.left - gaps.right, area.height - gaps.top - gaps.bottom);
    }

    // --- order -------------------------------------------------------------

    // New tiles: dwindle splits the active tile (Hyprland), the others
    // append (after the active one in the order for dwindle too, so a later
    // switch of layout keeps them together).
    function addTile(s, tile, activeTile) {
        if (s.order.indexOf(tile) >= 0) return;
        syncTree(s);
        var at = s.order.indexOf(activeTile);
        if (s.layout === "dwindle" && at >= 0) {
            s.order.splice(at + 1, 0, tile);
            s.tree = replaceLeaf(s.tree, activeTile, function (leaf) {
                return { key: "d" + (s.next++), a: leaf, b: { tile: tile } };
            });
            return;
        }
        if (s.layout === "dwindle" && s.order.length) {
            var last = s.order[s.order.length - 1];
            s.order.push(tile);
            s.tree = replaceLeaf(s.tree, last, function (leaf) {
                return { key: "d" + (s.next++), a: leaf, b: { tile: tile } };
            });
            return;
        }
        s.order.push(tile);
        if (!s.tree) s.tree = { tile: tile };
        else s.tree = { key: "d" + (s.next++), a: s.tree, b: { tile: tile } };
    }

    function removeTile(s, tile) {
        var i = s.order.indexOf(tile);
        if (i < 0) return false;
        s.order.splice(i, 1);
        s.tree = replaceLeaf(s.tree, tile, function () { return null; });
        return true;
    }

    // `next` takes the place of `tile` (a window becoming a group, a group
    // whose last window leaves).
    function renameTile(s, tile, next) {
        var i = s.order.indexOf(tile);
        if (i < 0 || s.order.indexOf(next) >= 0) return false;
        s.order[i] = next;
        s.tree = replaceLeaf(s.tree, tile, function () { return { tile: next }; });
        return true;
    }

    function swapTiles(s, a, b) {
        var i = s.order.indexOf(a), j = s.order.indexOf(b);
        if (i < 0 || j < 0 || i === j) return false;
        s.order[i] = b;
        s.order[j] = a;
        var tmp = "\u0000swap";
        s.tree = replaceLeaf(s.tree, a, function () { return { tile: tmp }; });
        s.tree = replaceLeaf(s.tree, b, function () { return { tile: a }; });
        s.tree = replaceLeaf(s.tree, tmp, function () { return { tile: b }; });
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
    function resize(s, area, gap, tile, axis, delta, edge, shown) {
        var dir = axis === "w" ? "v" : "h";
        var nodes = layout(s, area, gap, shown).nodes.filter(function (n) { return n.dir === dir; });
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
    function toggleSplit(s, area, gap, tile, shown) {
        var nodes = layout(s, area, gap, shown).nodes;
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

    // The Maprisma panel apps' `--window` popups (app id io.github.ubruckhaus.CosmicMaprisma…,
    // `.Window` too) float like their Hyprland rule makes them: small fixed-size tools under the
    // bar, never a tile. Plus the user's floatingClasses (app id or desktop file name).
    var POPUP_PREFIX = "io.github.ubruckhaus.cosmicmaprisma";
    function floatsByClass(resourceClass, desktopFileName, floating) {
        var cls = String(resourceClass || "").toLowerCase(), app = String(desktopFileName || "").toLowerCase();
        if (cls.indexOf(POPUP_PREFIX) === 0 || app.indexOf(POPUP_PREFIX) === 0) return true;
        return (floating || []).indexOf(cls) >= 0 || (floating || []).indexOf(app) >= 0;
    }

    return {
        LAYOUTS: LAYOUTS, rect: rect, clamp: clamp, newSurface: newSurface, layout: layout, inset: inset,
        addTile: addTile, removeTile: removeTile, renameTile: renameTile, swapTiles: swapTiles, leaves: leaves, cycleLayout: cycleLayout,
        resize: resize, toggleSplit: toggleSplit, neighbor: neighbor, tileAt: tileAt,
        overflowTarget: overflowTarget, parseLimits: parseLimits, parseIndexList: parseIndexList, floatsByClass: floatsByClass,
    };
})();
