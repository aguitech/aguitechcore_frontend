// sitemap.controller.js
// -----------------------------------------------------------
// Public sitemap.xml generator.
// Returns a Sitemaps Protocol 0.9 compliant XML document with:
//   - Homepage
//   - Public blog listing
//   - Every published Post at /public/blog/:slug
//
// Mounted at GET /sitemap.xml in index.js (BEFORE any auth middleware).
// Refreshes on every request — no cache needed since it's a single
// Mongo query against the (already indexed) {status, publishedAt} fields.
// -----------------------------------------------------------

import { Post } from '../models/Post.js';

const DEFAULT_BASE = 'https://sxxysecret.com';

// XML 1.0 escape for character data + attribute values.
// Sitemap Protocol spec only escapes the five XML predefined entities.
function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// W3C datetime format used by <lastmod>: ISO 8601 with 'Z' suffix.
// We normalize Date → UTC then format manually (avoids any TZ drift
// from the runtime locale).
function toIsoUtc(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  // toISOString gives "YYYY-MM-DDTHH:mm:ss.sssZ" — that's exactly what
  // sitemaps spec wants, so just slice the millis to keep it tidy.
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function getSitemap(_req, res, next) {
  try {
    const base = getBaseUrl();

    // Static entries — always present.
    const now = toIsoUtc(new Date());
    const entries = [
      { loc: `${base}/`, changefreq: 'daily', priority: '1.0', lastmod: now },
      { loc: `${base}/public/blog`, changefreq: 'daily', priority: '0.9', lastmod: now },
      { loc: `${base}/public/blog/`, changefreq: 'daily', priority: '0.9', lastmod: now },
    ];

    // Dynamic entries — every published post, newest first.
    const posts = await Post.find({ status: 'publicado' })
      .sort({ publishedAt: -1, createdAt: -1 })
      .select('slug publishedAt updatedAt')
      .lean();

    for (const p of posts) {
      if (!p.slug) continue; // defensive — shouldn't happen given the schema unique index
      entries.push({
        loc: `${base}/public/blog/${escapeXml(p.slug)}`,
        changefreq: 'weekly',
        priority: '0.7',
        // Prefer publishedAt (when it actually went live); fall back to
        // updatedAt, then to creation. Never empty — Google will warn.
        lastmod: toIsoUtc(p.publishedAt || p.updatedAt) || now,
      });
    }

    // Build the XML body. Using an array+join instead of a template string
    // makes the escaping auditable in one place.
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ];
    for (const e of entries) {
      lines.push('  <url>');
      lines.push(`    <loc>${escapeXml(e.loc)}</loc>`);
      lines.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
      lines.push(`    <changefreq>${escapeXml(e.changefreq)}</changefreq>`);
      lines.push(`    <priority>${escapeXml(e.priority)}</priority>`);
      lines.push('  </url>');
    }
    lines.push('</urlset>');
    lines.push(''); // trailing newline — keeps the response body tidy

    const body = lines.join('\n');

    // Explicit no-cache headers. Sitemaps are cheap to regenerate and
    // crawlers benefit from seeing fresh lastmod on every fetch.
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.status(200).send(body);
  } catch (err) {
    next(err);
  }
}

// -----------------------------------------------------------
// robots.txt — served dynamically so the Sitemap directive tracks
// PUBLIC_BASE_URL. Hard-coded Disallow list matches the routes that
// the React SPA requires auth for; anything else is open.
// -----------------------------------------------------------
const ROBOTS_DISALLOW = [
  '/api/',
  '/dashboard',
  '/clients',
  '/projects',
  '/proyectos',
  '/users',
  '/tasks',
  '/calendar',
  '/chat',
  '/profile',
  '/blog',
  '/notifications',
  '/appointments',
  '/my-appointments',
  '/audit-log',
];

export function getRobots(_req, res, next) {
  try {
    const base = getBaseUrl();
    const lines = ['User-agent: *'];
    for (const path of ROBOTS_DISALLOW) {
      lines.push(`Disallow: ${path}`);
    }
    // Open everything else by also emitting Allow: /.
    lines.push('Allow: /');
    lines.push('');
    lines.push(`Sitemap: ${base}/sitemap.xml`);
    lines.push(''); // trailing newline

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // cache an hour — robots.txt rarely changes
    });
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
}