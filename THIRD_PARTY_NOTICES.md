# Third-party notices

Siggo's original code and documentation are available under the [MIT License](LICENSE). Separately identified third-party material retains its own license and notices. The MIT license does not grant rights to competition data, artwork, logos, or trademarks owned by others.

## shadcn/ui

UI primitives under `src/components/ui/` include adaptations of [shadcn/ui](https://github.com/shadcn-ui/ui). Its [MIT notice](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) is retained below:

```text
MIT License

Copyright (c) 2023 shadcn

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

## Dependencies

Dependencies are installed through npm rather than vendored as source. Their respective licenses apply independently; see `package.json`, `package-lock.json`, and the notices distributed with each package. Preserve applicable notices when distributing dependencies or built application bundles.

## MLContests calendar

The [MLContests calendar](https://github.com/mlcontests/mlcontests.github.io) is published under [GPL-3.0](https://github.com/mlcontests/mlcontests.github.io/blob/master/LICENSE). Siggo fetches relevant metadata at runtime and provides attribution in Source coverage. That dataset is not relicensed under Siggo's MIT license.

## Publisher metadata and images

Source metadata and linked images remain subject to the original publishers' terms and applicable rights. Listing a platform does not imply endorsement or a platform-wide reuse grant. No rights to source artwork, logos, or trademarks are conveyed by Siggo's code license.

Zindi and TensorHack collection, and the small curated set of event-matched organizer-logo references, follow owner-approved, permission-unverified working assumptions. Those assumptions are not verified publisher permission and do not transfer to another operator as a license. Review the current source terms before running your own collectors. Devpost pages and APIs are not collected.

See [Sources and data](docs/sources.md), [source-access research](docs/research/source-access.md), and [indirect Devpost research](docs/research/devpost-alternatives.md) for provenance, attribution, and access boundaries.

Private workspaces, credentials, and live catalog snapshots are not included in the repository.
