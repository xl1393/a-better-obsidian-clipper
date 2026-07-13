# A Better Obsidian Clipper

> A community fork of [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper),
> based on upstream **v1.7.0**. This is **not** an official Obsidian project. It is a modified
> ("魔改") version that adds Cloudflare R2 image hosting and direct GitHub saving on top of the
> original clipper.
>
> Repository: https://github.com/xl1393/a-better-obsidian-clipper
> Current version: **0.1.0** (early test release)

A Better Obsidian Clipper helps you highlight and capture the web in your favorite browser. Anything you save is stored as durable Markdown files that you can read offline, and preserve for the long term.

This fork extends the original with two goals in mind:

1. **Images that never break** — automatically rehost clipped images to your own Cloudflare R2 bucket.
2. **Save anywhere Git lives** — commit clipped Markdown straight into a GitHub repository.

## What's different in this fork

### 1. Cloudflare R2 integration

When you clip a page, image links in the source often point back to the original site and can rot over time (links expire, images get moved or deleted). With R2 integration enabled, A Better Obsidian Clipper will:

- Upload the images from the clipped page to a **public Cloudflare R2 bucket** that you configure.
- Rewrite the image links in the saved Markdown to point at your R2 bucket instead of the original source.

The result is a self-contained Markdown note whose images stay alive as long as your bucket does — no more worrying about images disappearing after you clip them.

You configure your R2 endpoint, bucket, credentials, and public base URL in the extension settings.

### 2. GitHub integration

Instead of (or in addition to) saving into an Obsidian vault, this fork lets you save clipped `.md` files **directly into a GitHub repository** you've configured. Point it at a repo, branch, and path, provide an access token, and clips are committed straight to GitHub.

## Get started

This is a fork intended to be built and installed locally (see [Developers](#developers) below). It is not published to the browser extension stores.

## Use the extension

The core clipping, highlighting, and templating behavior is unchanged from the upstream project. Documentation for those features is available on the [Obsidian Help site](https://help.obsidian.md/web-clipper), which covers how to use [highlighting](https://help.obsidian.md/web-clipper/highlight), [templates](https://help.obsidian.md/web-clipper/templates), [variables](https://help.obsidian.md/web-clipper/variables), [filters](https://help.obsidian.md/web-clipper/filters), and more.

The R2 and GitHub features described above are specific to this fork and are configured in the extension's settings page.

## Developers

This fork targets **Chromium browsers only** (Chrome, Brave, Edge, Arc, and other Chromium-based browsers). Firefox and Safari builds have been removed.

To build the extension:

```
npm install
npm run build
```

`npm install` fetches the dependencies (only needed the first time, or when dependencies change). `npm run build` then creates the `dist/` directory containing the Chromium build.

### Install the extension locally

For Chromium browsers, such as Chrome, Brave, Edge, and Arc:

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` directory

### Run tests

```
npm test
```

Or run in watch mode during development:

```
npm run test:watch
```

## Third-party libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [defuddle](https://github.com/kepano/defuddle) for content extraction and Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [dompurify](https://github.com/cure53/DOMPurify) for sanitizing HTML

## Credits

This project is a fork of the [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) by Obsidian. All credit for the original clipper goes to the Obsidian team and its contributors.

## License

A Better Obsidian Clipper is a fork of Obsidian Web Clipper and remains open source under the MIT License. The original copyright is held by Obsidian; fork modifications are copyright their respective contributors. See the [LICENSE](/LICENSE) file for details.

All Obsidian trademarks, icons, marketing copy, and other marketing assets are property of Obsidian and are excluded from the MIT License.
