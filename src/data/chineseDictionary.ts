/**
 * Chinese lookups: pinyin, meaning, and the pinyin -> character conversion the
 * speech service needs.
 *
 * This used to be a hand-written table of 89 entries, which meant that any
 * character outside it — which is most of them — had no pinyin and no meaning
 * at all. Now:
 *
 *  - PINYIN comes from pinyin-pro, which reads a word in context. That matters
 *    more than it sounds: 咳 alone is "hāi", but 止咳 is "zhǐ ké", and 银行 is
 *    "yín háng" rather than "yín xíng". No static per-character table can get
 *    those right.
 *  - MEANINGS come from a CC-CEDICT subset built by scripts/build-chinese-dict.cjs,
 *    trimmed to every single character plus common vocabulary (~27k entries).
 *
 * Both are loaded on demand, so a child practising English spelling never
 * downloads either.
 *
 * The curated table below stays as a hand-checked override: CC-CEDICT glosses
 * are written for adult learners, and for the words a Singapore P1-P3 list
 * actually uses a short child's definition reads better.
 */
import type { ChineseInfo } from '../types'

/** Hand-checked entries: character(s) -> [pinyin with tone marks, meaning]. */
export const CHINESE_DICTIONARY: Record<string, [pinyin: string, meaning: string]> = {
  我: ['wǒ', 'I, me'],
  你: ['nǐ', 'you'],
  他: ['tā', 'he, him'],
  她: ['tā', 'she, her'],
  好: ['hǎo', 'good, well'],
  大: ['dà', 'big, large'],
  小: ['xiǎo', 'small, little'],
  上: ['shàng', 'up, above, on top'],
  下: ['xià', 'down, below, under'],
  人: ['rén', 'person, people'],
  手: ['shǒu', 'hand'],
  水: ['shuǐ', 'water'],
  火: ['huǒ', 'fire'],
  山: ['shān', 'mountain'],
  日: ['rì', 'sun, day'],
  月: ['yuè', 'moon, month'],
  木: ['mù', 'wood, tree'],
  天: ['tiān', 'sky, day'],
  地: ['dì', 'earth, ground'],
  心: ['xīn', 'heart, mind'],
  口: ['kǒu', 'mouth'],
  目: ['mù', 'eye'],
  鱼: ['yú', 'fish'],
  鸟: ['niǎo', 'bird'],
  猫: ['māo', 'cat'],
  狗: ['gǒu', 'dog'],
  花: ['huā', 'flower'],
  树: ['shù', 'tree'],
  学: ['xué', 'to study, to learn'],
  校: ['xiào', 'school'],
  家: ['jiā', 'home, family'],
  父: ['fù', 'father'],
  母: ['mǔ', 'mother'],
  哥: ['gē', 'older brother'],
  姐: ['jiě', 'older sister'],
  弟: ['dì', 'younger brother'],
  妹: ['mèi', 'younger sister'],
  吃: ['chī', 'to eat'],
  喝: ['hē', 'to drink'],
  看: ['kàn', 'to look, to read'],
  听: ['tīng', 'to listen'],
  说: ['shuō', 'to speak, to say'],
  写: ['xiě', 'to write'],
  玩: ['wán', 'to play'],
  走: ['zǒu', 'to walk'],
  跑: ['pǎo', 'to run'],
  睡: ['shuì', 'to sleep'],
  多: ['duō', 'many, much'],
  少: ['shǎo', 'few, little'],
  快: ['kuài', 'fast, quick'],
  慢: ['màn', 'slow'],
  高: ['gāo', 'tall, high'],
  低: ['dī', 'low'],
  红: ['hóng', 'red'],
  黄: ['huáng', 'yellow'],
  蓝: ['lán', 'blue'],
  绿: ['lǜ', 'green'],
  白: ['bái', 'white'],
  黑: ['hēi', 'black'],
  一: ['yī', 'one (1)'],
  二: ['èr', 'two (2)'],
  三: ['sān', 'three (3)'],
  四: ['sì', 'four (4)'],
  五: ['wǔ', 'five (5)'],
  六: ['liù', 'six (6)'],
  七: ['qī', 'seven (7)'],
  八: ['bā', 'eight (8)'],
  九: ['jiǔ', 'nine (9)'],
  十: ['shí', 'ten (10)'],
  百: ['bǎi', 'hundred (100)'],
  千: ['qiān', 'thousand (1000)'],
  今天: ['jīntiān', 'today'],
  明天: ['míngtiān', 'tomorrow'],
  昨天: ['zuótiān', 'yesterday'],
  朋友: ['péngyou', 'friend'],
  老师: ['lǎoshī', 'teacher'],
  同学: ['tóngxué', 'classmate'],
}

/** Strip tone marks so "shuǐ", "shui" and "SHUI" all find 水. */
export function stripTones(pinyin: string): string {
  return pinyin
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** pinyin (tone-insensitive) -> character. Built once at module load. */
const PINYIN_INDEX: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const [hanzi, [pinyin]] of Object.entries(CHINESE_DICTIONARY)) {
    const key = stripTones(pinyin)
    // First entry wins, so the most common character for a syllable is kept.
    if (!(key in index)) index[key] = hanzi
  }
  return index
})()

/**
 * Turn pinyin into the character it spells, when we know it.
 *
 * This is what stops the app reading "shuǐ" out letter-by-letter through a
 * Mandarin voice, which is the single worst-sounding bug in the old version.
 * Deliberately synchronous and limited to the curated table: the speech path
 * needs an answer immediately, and a 27k-entry reverse index would be riddled
 * with homophones anyway — every syllable has dozens of characters, and
 * guessing the wrong one is worse than not guessing.
 */
export function pinyinToHanzi(pinyin: string): string | null {
  return PINYIN_INDEX[stripTones(pinyin)] ?? null
}

/* --------------------------- the loaded layers --------------------------- */

interface Loaded {
  toPinyin: (word: string) => string
  meanings: Record<string, string>
}

let loading: Promise<Loaded | null> | null = null

/**
 * Fetches pinyin-pro and the meanings table. Both are large and only matter to
 * a child with Chinese words, so they are a separate chunk rather than part of
 * the app bundle.
 */
function load(): Promise<Loaded | null> {
  if (!loading) {
    loading = Promise.all([import('pinyin-pro'), import('./generated/chineseMeanings.json')])
      .then(([pinyinPro, meanings]) => ({
        toPinyin: (word: string) => pinyinPro.pinyin(word),
        meanings: (meanings.default ?? meanings) as Record<string, string>,
      }))
      .catch(() => {
        // Offline on first use. Reset so a later attempt can retry rather than
        // caching the failure for the rest of the session.
        loading = null
        return null
      })
  }
  return loading
}

/** Start fetching before the user needs it, e.g. when a Chinese word is shown. */
export function preloadChinese(): void {
  void load()
}

/**
 * Everything we know about a Chinese word. Returns nulls rather than throwing:
 * pinyin and meaning are enrichment, and a missing one must never stop the
 * child practising the word.
 */
export async function lookupChinese(word: string): Promise<ChineseInfo> {
  const curated = CHINESE_DICTIONARY[word]
  const loaded = await load()

  const pinyin = curated?.[0] ?? (loaded ? loaded.toPinyin(word) || null : null)
  // The curated gloss wins: it is written for a child, CC-CEDICT is not.
  const meaning = curated?.[1] ?? loaded?.meanings[word] ?? null

  return { word, pinyin, meaning }
}

/** Testing seam — drops the loaded chunk so a case can start clean. */
export function resetChineseCache(): void {
  loading = null
}
