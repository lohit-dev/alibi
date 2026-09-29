# Alibi

Alibi is a private desktop work ledger. Record what you worked on each day, then use those records to prepare a clear summary for performance reviews.

## What it does

- Log time by task on a daily timeline.
- Review effort and focus across a selected period.
- Copy an email-ready work summary or export your records as JSON.

## Local-first

Your data stays in a SQLite database on your computer. Alibi needs no account or network connection. Export a JSON backup whenever you need one.

## Run locally

```sh
bun install
bun run tauri dev
```

Preview installers are published in [GitHub Releases](https://github.com/lohit-dev/alibi/releases).

On 64-bit Linux, install the latest preview with:

```sh
curl -fsSL https://raw.githubusercontent.com/lohit-dev/alibi/master/install.sh | sh
```

The installer places Alibi in your user account; it does not need `sudo`. macOS and Windows installers are available on the Releases page.

## License

MIT. See [LICENSE](LICENSE).
