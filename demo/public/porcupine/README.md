# Optional Porcupine Wake-Word Assets

The demo works without wake-word activation. If the Porcupine files are absent,
the interactive demos show a missing-assets status and the voice widget still
starts manually.

Wake-word activation is an optional Picovoice Porcupine integration. OpenAI does
not provide, sublicense, or redistribute the Porcupine model, keyword, access
key, or service. Before enabling it, review Picovoice's current docs and legal
terms, then decide whether your planned use is permitted:

- [Porcupine docs](https://picovoice.ai/docs/porcupine/)
- [Picovoice Console](https://console.picovoice.ai/)
- [Picovoice terms of use](https://picovoice.ai/docs/terms-of-use/)

At the time this note was written, Picovoice described free access as limited to
non-commercial use and required a paid plan for commercial use. Treat that as a
pointer, not a license grant; the current Picovoice terms control.

Do not commit `.pv` or `.ppn` files to this repo.

To enable wake words in the demo:

1. Get a Picovoice access key that matches your licensed use, then add it to
   `demo/.env.local`:

   ```bash
   VITE_PICOVOICE_ACCESS_KEY=your_picovoice_access_key
   ```

2. Obtain a Porcupine Web model file and this demo's keyword file from
   Picovoice, then put both local-only assets in this directory:

   ```text
   hey-chappie_en_wasm_v4_0_0.ppn
   porcupine_params.pv
   ```

3. Run the demo:

   ```bash
   npm run demo
   ```

When those assets are present, the interactive demo initializes Porcupine from
`/porcupine/hey-chappie_en_wasm_v4_0_0.ppn` and
`/porcupine/porcupine_params.pv`.

Without these files, the demo still runs. Wake-word status will report the
missing asset names, and you can start voice manually with the widget.
