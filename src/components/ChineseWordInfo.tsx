/**
 * Pinyin, meaning and 笔画 (stroke order) for a Chinese word.
 *
 * Wired into the word list and the test feedback screen — the two places a
 * parent actually looks at a Chinese word and asks "what does this mean, and
 * how is it pronounced". Both come from lookupChinese(), which reads the word
 * in context (see chineseDictionary.ts) rather than character-by-character, so
 * 银行 comes back "yín háng" rather than the wrong reading of 行.
 */
import { useEffect, useState } from 'react'
import { Modal } from './ui'
import StrokeOrder from './StrokeOrder'
import { lookupChinese, pinyinToHanzi } from '../data/chineseDictionary'
import type { ChineseInfo, WordLang } from '../types'

interface Props {
  word: string
  lang: WordLang
  /** Tighter spacing for a list row; the default suits a standalone card. */
  compact?: boolean
}

export default function ChineseWordInfo({ word, lang, compact }: Props) {
  const [info, setInfo] = useState<ChineseInfo | null>(null)
  const [writingChar, setWritingChar] = useState<string | null>(null)

  useEffect(() => {
    if (lang !== 'zh' && lang !== 'py') {
      setInfo(null)
      return
    }
    let cancelled = false
    void (async () => {
      // Pinyin-only input ("shuǐ") has no meaning of its own — resolve it to
      // the character first, the same conversion the speech service uses.
      const hanzi = lang === 'py' ? pinyinToHanzi(word) : word
      const looked = hanzi ? await lookupChinese(hanzi) : null
      if (cancelled) return
      setInfo(
        lang === 'py'
          ? { word, pinyin: word, meaning: looked?.meaning ?? null }
          : looked ?? { word, pinyin: null, meaning: null },
      )
    })()
    return () => {
      cancelled = true
    }
  }, [word, lang])

  if (lang !== 'zh' && lang !== 'py') return null
  if (!info) return null

  // Stroke order needs individual hanzi. A resolved pinyin word is exactly
  // one character; a written word may be several, each practised separately.
  const hanziForWriting = lang === 'py' ? (pinyinToHanzi(word) ? [pinyinToHanzi(word) as string] : []) : [...word]

  return (
    <>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? 'text-xs' : 'text-sm'} text-ink-soft`}>
        {info.pinyin && <span className="font-bold text-grape-600">{info.pinyin}</span>}
        {info.meaning && <span>{info.meaning}</span>}
        {!info.pinyin && !info.meaning && <span className="italic">Meaning not in our dictionary yet</span>}
        {hanziForWriting.length > 0 && (
          <button
            className="ml-1 font-bold text-grape underline decoration-dotted underline-offset-2"
            onClick={() => setWritingChar(hanziForWriting[0])}
          >
            ✍️ Practise writing
          </button>
        )}
      </div>

      {writingChar && (
        <Modal title={`✍️ Writing ${writingChar}`} onClose={() => setWritingChar(null)}>
          <div className="space-y-3">
            <StrokeOrder char={writingChar} size={240} />
            {hanziForWriting.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2 border-t border-grape-50 pt-3">
                {hanziForWriting.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setWritingChar(ch)}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${
                      ch === writingChar ? 'bg-grape text-white' : 'bg-grape-50 text-ink'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
