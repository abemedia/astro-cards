# astro-cards 🏞️

An Astro integration that renders `.astro` components to images. Open Graph cards, badges, tickets,
or any fixed-size visual composed in markup.

## Why Astro Cards?

Every site needs images it cannot author by hand: an Open Graph card per post, a badge per release,
a ticket per attendee. Astro has no built-in way to produce them, so the usual answer is a separate
templating layer, either a fixed template you fill with a title and a description, or JSX rendered
by a library that is not the one your site is built with.

With **Astro Cards** the template is an ordinary `.astro` component. You write markup and CSS, take
props, import images with `astro:assets`, and use the fonts you already configured. The integration
renders it with [takumi](https://takumi.kane.tw) and hands back the URL of an image.

It works both on prerendered pages and on pages rendered on demand.

## Installation

```sh
npx astro add astro-cards
```

### Manual Install

Install `astro-cards` using your package manager.

```sh
npm install astro-cards
```

Add the integration to your `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import cards from 'astro-cards';

export default defineConfig({
  // ...
  integrations: [cards()],
});
```

## Usage

### Creating a card

Cards are `.astro` components in `src/cards`. The file name is the card's name, so
`src/cards/post.astro` is the card `post`, and a card in a subdirectory keeps its path,
`src/cards/blog/post.astro` being `blog/post`.

```astro
---
import type { CardOptions } from 'astro-cards';

interface Props {
  title: string;
}

export const card = { width: 1200, height: 630 } satisfies CardOptions;

const { title } = Astro.props;
---

<div class="card">{title}</div>

<style is:inline>
  .card {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #17171a;
    color: #ffffff;
    font-size: 64px;
  }
</style>
```

> [!IMPORTANT]  
> Style blocks in a card must be `is:inline`. Astro hoists a plain `<style>` into a bundled
> stylesheet that the renderer never sees, so the card would come out unstyled.

### Rendering a card

Call `renderCard` with the card's name and its props. It returns the URL to embed, plus the
dimensions and MIME type, which is what the Open Graph tags want.

```astro
---
import { renderCard } from 'astro-cards/runtime';

const card = await renderCard('post', { title: Astro.props.title });
---

<meta property="og:image" content={card.src} />
<meta property="og:image:width" content={card.width} />
<meta property="og:image:height" content={card.height} />
<meta property="og:image:type" content={card.type} />
```

Card names are typed once `astro sync` has run, so an unknown name is a type error and the props are
checked against the card's own `Props`.

> [!WARNING]  
> On a page rendered on demand the props travel in the image URL, encoded but not encrypted, and the
> response is publicly cacheable. Do not pass secrets or personal data.

### Size, format and quality

Each option can be set in three places, and the nearest one wins: the call site beats the card,
which beats the integration config.

```js
// astro.config.mjs: the default for every card
cards({ width: 1200, height: 630, format: 'jpeg', quality: 90 });
```

```astro
---
// the card: a default for this template
export const card = { width: 400, height: 200, format: 'png' };
---
```

```js
// the call site: this one image
await renderCard('post', { title }, { width: 800, height: 418 });
```

Formats are `png`, `jpeg` and `webp`. `quality` runs from 0 to 100 and applies to the lossy formats
only.

### Fonts

A card's fonts come from the `@font-face` rules in its own markup. A card that declares none renders
its text in Noto Sans, fetched from Google Fonts.

The easiest source is Astro's fonts API, whose `<Font>` component writes the `@font-face` rules
straight into the card:

```astro
---
import { Font } from 'astro:assets';
---

<Font cssVariable="--font-heading" />

<div class="card">Hello</div>

<style is:inline>
  .card {
    font-family: var(--font-heading);
  }
</style>
```

Hand-written `@font-face` rules work as well, whether the file sits in `public/` or on another host:

```astro
<style is:inline>
  @font-face {
    font-family: Inter;
    src: url(/fonts/inter-latin-400.woff2) format('woff2');
    unicode-range: U+0000-00FF;
  }
</style>
```

Declaring `unicode-range` is worth doing for a family split into subsets, because the renderer then
loads only the files the text actually needs.

> [!NOTE]  
> Stylesheet `<link>` elements are not fetched. Faces have to be declared in the card's markup.

### Images

Images imported through `astro:assets` work as they do anywhere else, and so do files in `public/`:

```astro
---
import { Image } from 'astro:assets';
import photo from '../assets/photo.png';
---

<Image src={photo} width={200} height={200} alt="" />

<img src="/logo.png" width="100" height="100" alt="" />

<style is:inline>
  .backdrop {
    background-image: url(/backdrop.png);
  }
</style>
```

Images on other hosts are fetched, and are subject to the same
[`image.domains`](https://docs.astro.build/en/reference/configuration-reference/#imagedomains) and
[`image.remotePatterns`](https://docs.astro.build/en/reference/configuration-reference/#imageremotepatterns)
rules as the rest of your site.

## Options

| Option    | Type                        | Default       | Description                                       |
| --------- | --------------------------- | ------------- | ------------------------------------------------- |
| `dir`     | `string`                    | `'src/cards'` | Where card components live, relative to the root. |
| `width`   | `number`                    | `1200`        | Default pixel width.                              |
| `height`  | `number`                    | `630`         | Default pixel height.                             |
| `format`  | `'png' \| 'jpeg' \| 'webp'` | `'jpeg'`      | Default encoding.                                 |
| `quality` | `number`                    | `90`          | Default encoder quality, 0 to 100, lossy formats. |

## Limitations

A card rendered on demand receives its props through the URL, so they must be
[serialisable](https://developer.mozilla.org/en-US/docs/Glossary/Serialization): able to be
translated into a format suitable for transfer over a network. Not every structure is, so there are
some limitations on what can be passed to `renderCard`.

The following prop types are supported: plain object, `number`, `string`, `boolean`, `null`,
`undefined`, `Array`, `Map`, `Set`, `RegExp`, `Date`, `BigInt`, `URL`, `Uint8Array`, `Uint16Array`,
`Uint32Array`, and `Infinity`. Repeated and circular references are preserved. The decoded on-demand
payload is limited to 128 KiB.

Notably, functions and class instances cannot be passed, as they cannot be serialised.

> [!NOTE]  
> This applies whenever a card is rendered on demand, which includes every card in `astro dev`. A
> prerendered build hands props straight to the component, so an unsupported prop can pass
> `astro build` and fail in `astro dev`.
