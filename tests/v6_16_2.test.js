// v6.16.2 regression tests (9 Nov 2026): the new app icon (option A, "Richer").
// The Home Screen icon, the browser tab icon and the manifest icon are all the
// bolder vault door, edge to edge, in one rich gold gradient.
// Run from the repo root: TZ=Australia/Brisbane node tests/v6_16_2.test.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const pngSize = buf => buf.slice(1, 4).toString() === "PNG" ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;

// Home Screen icon (iOS)
const touch = html.match(/<link rel="apple-touch-icon" sizes="180x180" href="data:image\/png;base64,([^"]+)">/);
ok(touch && (html.match(/rel="apple-touch-icon"/g) || []).length === 1, "one apple-touch-icon, sized 180x180");
const tbuf = touch ? Buffer.from(touch[1], "base64") : Buffer.alloc(0);
ok(JSON.stringify(pngSize(tbuf)) === "[180,180]", "the Home Screen icon is a 180×180 PNG");
ok(!touch || !touch[1].startsWith("iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAABHJElEQVR42u29d5hd"), "it isn't the old icon");

// Browser tab icon: the same door as SVG
const fav = html.match(/<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/);
const favSvg = fav ? decodeURIComponent(fav[1]) : "";
ok(/<svg [^>]*viewBox="0 0 1024 1024"/.test(favSvg), "the tab icon is the 1024 door SVG");
ok(/gradientUnits="userSpaceOnUse" x1="0" y1="176" x2="0" y2="848"/.test(favSvg), "…with one gradient over the whole door");
ok(/stop-color="#f2c14e"/.test(favSvg) && /stop-color="#d99a2b"/.test(favSvg) && /stop-color="#a8681a"/.test(favSvg), "…in the Richer golds");
ok(/scale\(1\.22\)/.test(favSvg), "…drawn bigger in the frame");

// Manifest icon
const man = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
ok(man.icons.length === 1 && man.icons[0].src === "icon-512.png" && man.icons[0].sizes === "512x512", "the manifest points at icon-512.png");
ok(JSON.stringify(pngSize(fs.readFileSync(path.join(root, "icon-512.png")))) === "[512,512]", "icon-512.png is 512×512");

// Version
const about = (html.match(/id="about-version-meta">Version (v[\d.]+)</) || [])[1];
const foot = (html.match(/<div id="version-footer">(v[\d.]+)<\/div>/) || [])[1];
ok(about && about === foot, "About matches the footer");
const v = (foot || "v0.0.0").slice(1).split(".").map(Number);
ok(v[0] > 6 || (v[0] === 6 && (v[1] > 16 || (v[1] === 16 && v[2] >= 2))), "version is v6.16.2 or later: " + foot);

console.log(`v6.16.2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
