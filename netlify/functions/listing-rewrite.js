// Netlify function: rewrites an Amazon title to the current limit and moves
// overflow details into Item Highlights. Holds ANTHROPIC_API_KEY server-side.
"use strict";

var MODEL = "claude-sonnet-4-6";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function reply(status, obj) {
  return { statusCode: status, headers: Object.assign({ "Content-Type": "application/json" }, CORS), body: JSON.stringify(obj) };
}

function str(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJson(text) {
  var t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  var a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a > -1 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

function buildPrompt(d) {
  var lim = d.media ? 200 : 75;
  var lines = [
    "You rewrite Amazon product titles so they comply with Amazon's current US title rules.",
    "",
    "Rules for the new title:",
    "- " + lim + " characters or fewer, counting spaces. Count carefully; aim for " + (lim - 5) + " to " + lim + ".",
    "- Start with the brand name if one is given, then the product type, then the most important differentiator (size, quantity or key feature).",
    "- Do not use these characters: ! $ ? _ { } ^ and no emojis or decorative symbols.",
    "- No word may appear more than twice (singular and plural count as the same word).",
    "- No promotional or subjective words such as best, top rated, sale, deal, cheap, #1, guaranteed, free shipping.",
    "- Title case. Numerals instead of spelled-out numbers. No all-caps words except real acronyms.",
    "- Keep only claims that appear in the seller's content. Never invent features, sizes, materials or numbers."
  ];
  if (!d.media) {
    lines.push(
      "",
      "Also write Item Highlights: 125 characters or fewer, counting spaces. Use short benefit-led phrases separated by commas, not full sentences.",
      "Fill it with the useful details that no longer fit in the title (materials, capacity, compatibility, use cases). Do not repeat words already in the new title. Same character and promotional-word rules apply."
    );
  }
  lines.push(
    "",
    "Seller content:",
    "Brand: " + (d.brand || "(not given)"),
    "Current title: " + d.title
  );
  if (d.highlights) lines.push("Current Item Highlights: " + d.highlights);
  d.bullets.forEach(function (b, i) { lines.push("Bullet " + (i + 1) + ": " + b); });
  lines.push(
    "",
    "Respond with JSON only, no commentary: {\"title\": \"...\", \"highlights\": \"" + (d.media ? "" : "...") + "\"}"
  );
  return lines.join("\n");
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Use POST." });

  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return reply(500, { error: "The rewrite service is not configured.", detail: "ANTHROPIC_API_KEY is missing. Add it in Netlify > Site configuration > Environment variables, then trigger a fresh deploy." });

  var body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "Request body must be JSON." }); }

  var data = {
    title: str(body.title, 400),
    brand: str(body.brand, 80),
    highlights: str(body.highlights, 400),
    bullets: (Array.isArray(body.bullets) ? body.bullets : []).slice(0, 3).map(function (b) { return str(b, 600); }).filter(Boolean),
    media: body.media === true
  };
  if (data.title.length < 3) return reply(400, { error: "Paste your current title first." });

  var res, json;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        temperature: 0.7,
        messages: [{ role: "user", content: buildPrompt(data) }]
      })
    });
    json = await res.json().catch(function () { return null; });
  } catch (e) {
    return reply(502, { error: "Could not reach the AI service.", detail: String(e && e.message || e) });
  }

  if (!res.ok) {
    var upstream = json && json.error && json.error.message ? json.error.message : ("HTTP " + res.status);
    return reply(502, { error: "The AI service returned an error.", detail: upstream, status: res.status });
  }

  var text = (json && Array.isArray(json.content) ? json.content : [])
    .filter(function (c) { return c.type === "text"; })
    .map(function (c) { return c.text; }).join("");
  var out = parseJson(text);
  if (!out || !out.title) return reply(502, { error: "The AI response could not be read.", detail: text.slice(0, 300) });

  return reply(200, {
    title: str(out.title, 300).replace(/[!$?_{}^\u00ac\u00a6]/g, ""),
    highlights: data.media ? "" : str(out.highlights, 300)
  });
};
