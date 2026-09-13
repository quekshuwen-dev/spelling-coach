/**
 * Builds the offline Chinese meanings file.
 *
 * The full CC-CEDICT is 124k entries and 3.5 MB of JSON, most of it chemistry,
 * place names and classical usages a primary-school child will never scan. This
 * keeps every single character (any one of them can turn up in a scan, and they
 * are cheap) plus multi-character words that are actually common, judged by HSK
 * level and by corpus frequency rank.
 *
 * Only the meaning is stored. Pinyin comes from pinyin-pro at runtime, which
 * reads polyphonic characters in context (止咳 -> zhǐ ké, not hāi) in a way no
 * static per-word table can.
 *
 * Run: node scripts/build-chinese-dict.cjs
 * Data: CC-CEDICT (CC-BY-SA 4.0) via chinese-lexicon.
 */
const { writeFileSync, mkdirSync } = require('fs')
const lexicon = require('chinese-lexicon')

const HANZI_WORD = /^[一-鿿]{1,4}$/
const MAX_GLOSS = 58

/**
 * The cut. chinese-lexicon's hskLevel is a 1-7 difficulty band over all 96k
 * words rather than the official HSK list, and levels 1-3 are the vocabulary a
 * primary-school child actually meets. The frequency rank catches common words
 * the banding misses. Together with every single character this is ~27k entries
 * and ~300 KB gzipped — fetched once, then cached by the service worker.
 */
const MAX_DIFFICULTY_BAND = 3
const FREQUENCY_RANK_LIMIT = 6000

/** Glosses that exist for lexicographers rather than for a child. */
const WEAK_GLOSS = /^(variant of|old variant|surname |see |see also|abbr\. for|used in|CL:|\(onom)/i

function cleanGloss(gloss) {
  let g = gloss
    .replace(/\[[^\]]*\]/g, '') // "Beijing[Bei3 jing1]" -> "Beijing"
    .replace(/\bCL:.*$/, '') // classifiers are grammar, not meaning
    .replace(/\s{2,}/g, ' ')
    .trim()
  // A long gloss is usually long because of a Latin name or an aside; the part
  // before the bracket is the bit a child needs.
  if (g.length > MAX_GLOSS) g = g.replace(/\s*\([^)]*\)/g, '').trim()
  return g.replace(/[;,]\s*$/, '').trim()
}

function buildMeaning(definitions) {
  const glosses = (definitions ?? [])
    .map(cleanGloss)
    .filter((g) => g && !WEAK_GLOSS.test(g) && g.length <= MAX_GLOSS)
  if (!glosses.length) return null
  // Two senses give a child a fighting chance at an ambiguous character
  // ("mù: wood, tree") without turning into a paragraph.
  let text = glosses[0]
  if (glosses[1] && text.length + glosses[1].length + 2 <= MAX_GLOSS) text += '; ' + glosses[1]
  return text
}

function rankOf(stats) {
  if (!stats) return Infinity
  const ranks = [stats.bookWordRank, stats.movieWordRank].filter((r) => typeof r === 'number' && r > 0)
  return ranks.length ? Math.min(...ranks) : Infinity
}

/** Keep it if a child could plausibly meet it. */
function worthKeeping(word, stats) {
  // Any single character can turn up in a scan, and they are cheap: 9.5k of
  // them is a small share of the file.
  if (word.length === 1) return true
  if (stats?.hskLevel && stats.hskLevel <= MAX_DIFFICULTY_BAND) return true
  return rankOf(stats) <= FREQUENCY_RANK_LIMIT
}

/** Lower is better: prefer the commonest sense with a plain gloss. */
function scoreEntry(entry) {
  const first = entry.definitions?.[0] ?? ''
  let score = Math.min(20, first.length / 10)
  if (WEAK_GLOSS.test(first)) score += 100
  if (/^\(/.test(first)) score += 10
  score += Math.min(30, rankOf(entry.statistics) / 5000)
  return score
}

const best = new Map()
for (const entry of lexicon.allEntries) {
  const word = entry.simp
  if (!HANZI_WORD.test(word)) continue
  if (!worthKeeping(word, entry.statistics)) continue
  const score = scoreEntry(entry)
  const existing = best.get(word)
  if (!existing || score < existing.score) best.set(word, { score, entry })
}

const out = {}
for (const [word, { entry }] of best) {
  const meaning = buildMeaning(entry.definitions)
  if (meaning) out[word] = meaning
}

// Shorter words first, then by codepoint: keeps the generated diff readable.
const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.length - b.length || a.localeCompare(b, 'zh')),
)

mkdirSync('src/data/generated', { recursive: true })
const path = 'src/data/generated/chineseMeanings.json'
const json = JSON.stringify(sorted)
writeFileSync(path, json)

const byLen = {}
for (const w of Object.keys(sorted)) byLen[w.length] = (byLen[w.length] ?? 0) + 1
console.log(`${path}: ${Object.keys(sorted).length} entries, ${(json.length / 1024).toFixed(0)} KB raw`)
console.log('by length:', JSON.stringify(byLen))
