# Story video dependencies

- **Mediabunny 1.66.4** is bundled from its npm distribution with esbuild 0.25.11. The bundle exposes `BufferTarget`, `CanvasSource`, `Mp4OutputFormat`, and `Output`. Its corresponding source is in the pinned npm archive and is licensed under MPL 2.0. [Source archive](https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.4.tgz)
- **h264-mp4-encoder 1.0.12** is the unmodified browser distribution from npm. The bundled WebAssembly encoder supplies H.264 and MP4 output when native encoding is unavailable. [Source project](https://github.com/TrevorSundberg/h264-mp4-encoder) · [Pinned archive](https://registry.npmjs.org/h264-mp4-encoder/-/h264-mp4-encoder-1.0.12.tgz)
