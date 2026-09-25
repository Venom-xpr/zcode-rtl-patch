# ZCode RTL Patch

Adds automatic **right-to-left text direction** to [ZCode Desktop](https://z.ai) for
**Arabic, Persian, Hebrew, Urdu** and other RTL scripts — chat messages, markdown
content, and the message composer all follow the natural direction of their text.

![RTL patch screenshot](docs/screenshot.png)

## What it does

- **Messages & markdown** — every text block (paragraph, heading, list item,
  blockquote, table cell, plain-text message) is tagged `dir="rtl"` or `dir="ltr"`
  using the Unicode **first strong character** rule (UAX #9), re-evaluated live
  while responses stream in.
- **Composer & inputs** — direction follows your typing, per keystroke.
- **Protected surfaces** — code blocks, inline code, math (KaTeX), the terminal
  (xterm) and code editors (Monaco / CodeMirror) are never touched.
- **Layout untouched** — sidebars, toolbars and buttons keep their LTR layout;
  only text content direction changes.

## Install

Requirements: **Windows**, **ZCode Desktop**, **Node.js 18+** (for the build step).

```
git clone https://github.com/Venom-xpr/zcode-rtl-patch.git
cd zcode-rtl-patch
build.cmd      :: builds dist\app-patched.asar from YOUR installed ZCode (~3 min)
install.cmd    :: closes ZCode, backs up, installs, verifies
```

Start ZCode — done. Nothing else is modified: your settings, chats and the
app's native-module folder stay untouched. The original `app.asar` is backed up
before anything changes.

> The patch archive is **not distributed in this repo** — `build.cmd` creates it
> from your own installed copy, so it always matches your ZCode version and
> nothing proprietary is redistributed.

## Uninstall

Run `uninstall.cmd` — it restores the original `app.asar` from the backup.

After a **ZCode app update** the patch is gone (the updater replaces the
archive) — just run `build.cmd` + `install.cmd` again.

## How it works

ZCode Desktop is an Electron app whose UI lives in `resources/app.asar`. The
build script:

1. extracts the archive,
2. copies [`patch/rtl-patch.js`](patch/rtl-patch.js) and
   [`patch/rtl-patch.css`](patch/rtl-patch.css) into the renderer assets,
3. injects two lines into `out/renderer/index.html` (after the app stylesheet,
   before the deferred module bundle, so the observer arms before React mounts),
4. repacks, keeping the same native modules unpacked as the original,
5. verifies the three patched files round-trip byte-identically.

The runtime patch is content-driven, not class-driven:

- A `MutationObserver` scans text blocks, computes the first strong directional
  character (skipping digits, punctuation, emoji), and sets `dir` accordingly.
- The stylesheet forces `direction`/`text-align` for tagged blocks with
  `!important`, because the app's own CSS would otherwise override the
  `dir` attribute.
- Persian/Arabic-Indic digits (`۰-۹`, `٠-٩`) are bidi-neutral and never flip a
  paragraph by themselves, exactly like the real UAX #9 algorithm.

You can try the detection engine standalone: serve the `test/` folder with any
static server (`npx serve test`) and open it in a browser.

## Compatibility & notes

- Built and tested against the ZCode Desktop build dated 2026-09-22
  (`app.asar` 326,915,059 bytes, Windows x64). The build script adapts to your
  installed version, but a future app restructure may need patch updates.
- The installer is interactive, self-elevating, and verifies the copied file
  before reporting success; on any failure it restores the original archive.
- If ZCode is installed in a non-default location, pass it to the build:
  `node build\build-patch.js --resources "D:\Apps\ZCode\resources"`.

## Legal

This patch is released under the [MIT License](LICENSE). It contains **no**
ZCode application code — it modifies your locally installed copy on your
machine. ZCode is a product of Z.ai; this project is not affiliated with or
endorsed by Z.ai.

---

## فارسی

این پروژه، متن راست‌به‌چپ (عربی، فارسی، عبری و...) را به برنامه‌ی دسکتاپ ZCode
اضافه می‌کند: پیام‌ها و بلوک‌های مارک‌داون بر اساس «اولین نویسه‌ی قوی» یونیکد
راست‌چین می‌شوند، کادر نوشتن جهت تایپ شما را دنبال می‌کند و بلوک‌های کد و ترمینال
همیشه چپ‌به‌راست می‌مانند.

نصب (ویندوز + Node.js):

```
git clone https://github.com/Venom-xpr/zcode-rtl-patch.git
cd zcode-rtl-patch
build.cmd       ← ساخت نسخه‌ی وصله‌شده از نصب فعلی ZCode روی سیستم شما
install.cmd     ← بستن ZCode، پشتیبان‌گیری، نصب و تأیید
```

حذف: اجرای `uninstall.cmd` نسخه‌ی اصلی `app.asar` را برمی‌گرداند.
بعد از به‌روزرسانی ZCode کافی است دوباره همین دو دستور را اجرا کنید.

این مخزن هیچ کدی از خود برنامه‌ی ZCode را منتشر نمی‌کند؛ وصله فقط روی نسخه‌ی
نصب‌شده‌ی خود شما اعمال می‌شود.
