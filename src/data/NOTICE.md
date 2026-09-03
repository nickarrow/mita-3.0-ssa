# Vendored dataset — provenance and license

The JSON files in this directory are a verbatim copy of the `data/` directory of
the MITA Open Blueprint project. They are **not** authored here. Do not hand-edit
them: fix the upstream repository and re-sync, so every downstream consumer gets
the correction.

## Provenance

|               |                                                    |
| ------------- | -------------------------------------------------- |
| Upstream      | https://github.com/nickarrow/mita-open-blueprint   |
| Commit        | `19a7e6c4e82a93d66cf97f14f31afd542b6b45d5`         |
| Upstream date | 2026-09-02                                         |
| Synced        | 2026-09-02                                         |
| Contents      | 76 BCM + 76 BPT JSON files, plus 76 diagram images |

`BLUEPRINT_SOURCE_COMMIT` in `src/constants/blueprint.ts` carries the same commit
so the running app can report which extraction it was built from. Keep the two in
step when re-syncing.

## Re-syncing

```bash
npm run sync:blueprint          # dry run: report what would change
npm run sync:blueprint -- --write
```

The script refuses to write when the upstream question counts move, because a
change to the number or order of questions invalidates stored `questionIndex`
values and needs a migration. See `src/services/blueprintRevision.ts`.

## License

The dataset is MIT licensed. The notice below is reproduced as the license
requires. This project as a whole is GPL-3.0; MIT is compatible with that.

```
MIT License

Copyright (c) 2025-2026 Nick Aretakis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## The underlying MITA content is public domain

The substantive content originates in the CMS MITA Framework v3.0 (May 2014
Update), a work of the U.S. Government, public domain under 17 U.S.C. § 105. The
MIT license above covers the compilation added upstream — the arrangement into
structured JSON, the schema, and the extraction metadata — not the CMS content
itself.

This is an unofficial conversion, not affiliated with or endorsed by CMS.
