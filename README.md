# ZCode RTL Patch

Adds automatic **right-to-left text direction** and **Markazi Text typography** to
[ZCode Desktop](https://z.ai) for **Arabic, Persian, Hebrew, Urdu** and other RTL
scripts — chat messages, markdown content, and the message composer all follow the
natural direction of their text.

![RTL patch screenshot](docs/screenshot.png)

## What it does

- **Smart RTL Detection (v1.4)** — does not just look at the first character:
  - **Ignores inline code prefixes** like `<code>/dashboard</code> → محتوای ...`,
    correctly recognizing the sentence as RTL.
  - **Overall text balance**: if RTL characters outnumber LTR characters, the block
    is RTL even if an English word starts the sentence.
  - **English-prefixed technical sentences**: lines starting with English route
    names or keywords that finish with a Persian/Arabic explanation (e.g.
    `staff / sessions / reports | همه جزئیات`) are recognized as RTL.
- **Markazi Text Typography** — bundles Google's [Markazi Text](https://fonts.google.com/specimen/Markazi+Text)
  locally for elegant, authentic Persian and Arabic calligraphy across all messages
  and the composer. Works 100% offline with zero CDN latency.
- **Composer & Inputs** — direction follows your typing live, including support for
  the Lexical rich-text editor used by the chat input.
- **Protected surfaces** — code blocks, inline code, math (KaTeX), the terminal
  (xterm) and code editors (Monaco / CodeMirror) stay strictly left-to-right and monospace.
- **Layout untouched** — sidebars, toolbars and buttons keep their LTR layout;
  only text content direction changes.
- **Safe installer** — never auto-launches the app after patching; you open ZCode
  manually when ready.

## Install

Requirements: **Windows**, **ZCode Desktop**, **Node.js 18+** (for the build step).

```
git clone https://github.com/Venom-xpr/zcode-rtl-patch.git
cd zcode-rtl-patch
build.cmd      :: builds dist\app-patched.asar from YOUR installed ZCode (~2 min)
install.cmd    :: closes ZCode, backs up, installs, verifies
```

Once installed, start ZCode manually — done! Nothing else is modified: your
settings, chats and native modules stay untouched. The original `app.asar` is
backed up automatically before anything changes.

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
2. copies [`patch/rtl-patch.js`](patch/rtl-patch.js),
   [`patch/rtl-patch.css`](patch/rtl-patch.css), and the bundled
   Markazi Text fonts into the renderer assets,
3. injects references into `out/renderer/index.html` (after the app stylesheet,
   before the deferred module bundle),
4. repacks, keeping native binaries (`*.{node,dll,exe}`) unpacked,
5. verifies the patched files inside the new archive.

You can try the detection engine standalone: serve the repository with any
static server (`npx serve .`) and open `/test/index.html` in a browser.

## Compatibility & notes

- Built and tested against ZCode Desktop on Windows x64.
- The installer is interactive, self-elevating, and verifies the copied file
  before reporting success; on any failure it restores the original archive.
- If ZCode is installed in a non-default location, pass it to the build:
  `node build\build-patch.js --resources "D:\Apps\ZCode\resources"`.

## Legal

This patch is released under the [MIT License](LICENSE). Markazi Text font is
licensed under the [SIL Open Font License](http://scripts.sil.org/OFL).
It contains **no** ZCode application code — it modifies your locally installed
copy on your machine. ZCode is a product of Z.ai; this project is not affiliated
with or endorsed by Z.ai.

---

## فارسی

این پروژه، متن راست‌به‌چپ هوشمند و فونت زیبای **مرکزی (Markazi Text)** را به
برنامه‌ی دسکتاپ ZCode اضافه می‌کند:

- **تشخیص هوشمند راست‌به‌چپ (v1.4)**:
  - کدهای درون‌خطی در اول جمله نادیده گرفته می‌شوند (مثلاً `<code>/dashboard</code> → محتوای...` به درستی راست‌چین می‌شود).
  - جملاتی که با کلمات انگلیسی شروع می‌شوند اما ادامه‌شان فارسی است بر اساس تعادل متن و انتهای جمله راست‌چین می‌شوند.
  - کادر نوشتن متن جهت تایپ شما را دنبال می‌کند (با پشتیبانی از ادیتور Lexical).
- **فونت مرکزی (Markazi Text)**:
  - فونت زیبای مرکزی به صورت فایل محلی همراه پچ بسته شده و بدون نیاز به اینترنت یا CDN اعمال می‌شود.
- **بلوک‌های کد و ترمینال**:
  - کدهای برنامه‌نویسی و ترمینال همواره چپ‌به‌راست و مونو‌اسپیس باقی می‌مانند.
- **نصب کاملاً امن**:
  - نصاب بعد از پچ کردن برنامه را خودکار باز نمی‌کند و فایل اصلی نسخه پشتیبان گرفته می‌شود.

نصب (ویندوز + Node.js):

```
git clone https://github.com/Venom-xpr/zcode-rtl-patch.git
cd zcode-rtl-patch
build.cmd       ← ساخت نسخه‌ی وصله‌شده از نصب فعلی ZCode روی سیستم شما
install.cmd     ← بستن ZCode، پشتیبان‌گیری، نصب و تأیید
```

حذف: اجرای `uninstall.cmd` نسخه‌ی اصلی `app.asar` را برمی‌گرداند.
بعد از به‌روزرسانی ZCode کافی است دوباره همین دو دستور را اجرا کنید.
