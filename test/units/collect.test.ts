import { fromHtml } from '@takumi-rs/helpers/html'
import { describe, expect, test } from 'vitest'
import { collectFonts, collectSources } from '../../src/render.js'

const BASE = 'https://site.test/docs/'

const collect = (html: string) => {
  const { node, css } = fromHtml(html)
  return collectSources(node, css, BASE)
}

describe('collectSources', () => {
  test('reads every position takumi renders an image from, in document order', () => {
    const found = collect(`
      <img src="photo.png" />
      <img src="/root.png" />
      <div style="background: url(shorthand.png)"></div>
      <div style="background-image: url('quoted.png'), url(second.png)"></div>
      <div style="mask-image: url(mask.png)"></div>
      <style>.a { background-image: url(sheet.png) }</style>
      <div class="a"></div>
    `)

    expect(found.keys().toArray()).toEqual([
      'photo.png',
      '/root.png',
      'shorthand.png',
      'quoted.png',
      'second.png',
      'mask.png',
      'sheet.png',
    ])
  })

  test('never reads text, attributes or links', () => {
    const found = collect(`
      <p>see /docs/readme.png</p>
      <a href="/link.png">x</a>
      <img src="a.png" alt="/alt.png" />
    `)

    expect(found.keys().toArray()).toEqual(['a.png'])
  })

  test('leaves font files to the font collector', () => {
    const found = collect(`
      <style>@font-face { font-family: R; src: url(/r.woff2) format("woff2") }</style>
      <img src="a.png" />
    `)

    expect(found.keys().toArray()).toEqual(['a.png'])
  })

  test('does not read a comment', () => {
    const found = collect(`
      <style>/* was url(old.png) */ .a { background: url(new.png) }</style>
    `)

    expect(found.keys().toArray()).toEqual(['new.png'])
  })

  test('reports a repeated reference once', () => {
    expect(collect('<img src="a.png" /><img src="a.png" />').keys().toArray()).toEqual(['a.png'])
  })

  test('resolves each reference against the base', () => {
    const found = collect(`
      <img src="photo.png" />
      <img src="./relative.png" />
      <img src="/root.png" />
      <img src="//cdn.test/x.png" />
      <img src="https://other.test/y.png" />
    `)

    expect(found.values().toArray()).toEqual([
      'https://site.test/docs/photo.png',
      'https://site.test/docs/relative.png',
      'https://site.test/root.png',
      'https://cdn.test/x.png',
      'https://other.test/y.png',
    ])
  })

  test('decodes entities in src, keyed by the raw attribute takumi matches on', () => {
    const found = collect(`
      <img src="/x?a=1&amp;b=2&#x2F;c&#39;d" />
      <div style="background: url(/y?a=1&amp;b=2)"></div>
      <style>.a { background: url(/z?a=1&amp;b=2) }</style>
    `)

    expect(found.entries().toArray()).toEqual([
      ['/x?a=1&amp;b=2&#x2F;c&#39;d', 'https://site.test/x?a=1&b=2/c%27d'],
      ['/y?a=1&b=2', 'https://site.test/y?a=1&b=2'],
      ['/z?a=1&amp;b=2', 'https://site.test/z?a=1&amp;b=2'],
    ])
  })

  test('leaves data URIs to takumi and SVG references alone', () => {
    const found = collect(`
      <img src="data:image/png;base64,AAAA" />
      <div style="background: url(#gradient)"></div>
    `)

    expect(found.size).toBe(0)
  })

  test('refuses a scheme nothing can fetch', () => {
    expect(() => collect('<img src="file:///etc/passwd" />')).toThrow(/unsupported image URL/)
  })

  test('does not mutate the tree', () => {
    const { node, css } = fromHtml('<div style="background: url(a.png)"><img src="b.png" /></div>')
    const before = JSON.stringify(node)
    collectSources(node, css, BASE)
    expect(JSON.stringify(node)).toBe(before)
  })
})

describe('collectFonts', () => {
  const faces = (css: string) => collectFonts([css], BASE)

  test('reads a face the way Astro emits it', () => {
    const found = faces(`
      @font-face {
        font-family: "Roboto";
        src: url(/_astro/fonts/a.woff2) format("woff2");
        font-display: swap;
        font-weight: 400;
        font-style: normal;
        unicode-range: U+0000-00FF, U+20AC;
      }
    `)

    expect(found).toEqual([
      {
        name: expect.stringMatching(/^Roboto s[0-9a-f]{8}$/),
        subsetOf: 'Roboto',
        subsetRank: 0,
        key: expect.stringMatching(
          /^Roboto s[0-9a-f]{8}:400:normal:https:\/\/site\.test\/_astro\/fonts\/a\.woff2$/,
        ),
        url: 'https://site.test/_astro/fonts/a.woff2',
        weight: 400,
        style: 'normal',
        ranges: [
          [0, 0xff],
          [0x20ac, 0x20ac],
        ],
      },
    ])
  })

  test('ranks a subset by its lowest codepoint, and one without a range last', () => {
    const ranks = faces(`
      @font-face { font-family: R; src: url(cyr.woff2); unicode-range: U+0400-045F, U+0490-0491 }
      @font-face { font-family: R; src: url(latin.woff2); unicode-range: U+0000-00FF }
      @font-face { font-family: R; src: url(all.woff2) }
    `).map((face) => face.subsetRank)

    expect(ranks).toEqual([0x400, 0, 0xffffffff])
  })

  test('expands a wildcard range', () => {
    const [face] = faces('@font-face { font-family: R; src: url(a.woff2); unicode-range: U+30?? }')

    expect(face?.ranges).toEqual([[0x3000, 0x30ff]])
  })

  test('groups the weights of a subset into one family', () => {
    const [latin, cyrillic, latinBold] = faces(`
      /* latin */
      @font-face { font-family: R; src: url(l400.woff2); font-weight: 400; unicode-range: U+0000-00FF }
      @font-face { font-family: R; src: url(c400.woff2); font-weight: 400; unicode-range: U+0400-045F }
      @font-face { font-family: R; src: url(l700.woff2); font-weight: 700; unicode-range: U+0000-00FF }
    `).map((face) => face.name)

    expect(latinBold).toBe(latin)
    expect(cyrillic).not.toBe(latin)
  })

  test('collapses only the faces that differ by weight alone', () => {
    const found = faces(`
      @font-face { font-family: V; src: url(v.woff2); font-weight: 400; font-style: normal }
      @font-face { font-family: V; src: url(v.woff2); font-weight: 700; font-style: normal }
      @font-face { font-family: V; src: url(v.woff2); font-weight: 400; font-style: italic }
      @font-face { font-family: W; src: url(v.woff2); font-weight: 400; font-style: normal }
      @font-face { font-family: S; src: url(s400.woff2); font-weight: 400 }
      @font-face { font-family: S; src: url(s700.woff2); font-weight: 700 }
      @font-face { font-family: V; src: url(v.woff2); font-weight: 400; font-style: normal; unicode-range: U+0400-045F }
    `)

    expect(
      found.map(({ subsetOf, style, weight, ranges }) => [subsetOf, style, weight, ranges]),
    ).toEqual([
      ['V', 'normal', undefined, []],
      ['V', 'italic', 400, []],
      ['W', 'normal', 400, []],
      ['S', undefined, 400, []],
      ['S', undefined, 700, []],
      ['V', 'normal', 400, [[0x400, 0x45f]]],
    ])
  })

  test('finds the file behind local() sources listed first', () => {
    const [face] = faces(`
      @font-face { font-family: R; src: local("R"), local("R-Regular"), url(/r.woff2) format("woff2") }
    `)

    expect(face?.url).toBe('https://site.test/r.woff2')
  })

  test('skips a face with no file, such as an optimised local fallback', () => {
    const found = faces(`
      @font-face { font-family: "R fallback"; src: local("Arial"); size-adjust: 107% }
    `)

    expect(found).toEqual([])
  })
})
