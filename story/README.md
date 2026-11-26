# Typefield Story Studio

Write a creative brief and review the resulting draft. Each scene has two words, a caption, ink, an optical motion, a duration, and an incoming cut. Select scenes on the timeline to edit, move, add, or remove them. The same sequence can be opened from a link or a score JSON file. [Open Story Studio](https://ejaubashi.github.io/t018/story/)

The monitor can save a still from the chosen angle or capture a paused sequence frame, including a cut in progress. Video renders the complete sequence as a silent 1080 × 1920 H.264 MP4 at 30 fps. UI guides mark approximate areas used by story interfaces and appear only in the monitor. Preview, image capture, and video encoding share one frame renderer. [WebCodecs reference](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)

## Research

Reviewed on 26 November 2026. Meta's SDK exposes separate endpoints to create and publish media. This is a useful boundary for Typefield. Users can draft and edit the story, then export it locally for a destination of their choosing. [Meta Business SDK](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ig-user.js)

Rive links individual timelines through transitions, Remotion gives transitions explicit timing, and Creatomate represents media as JSON. Typefield makes the timing and transitions part of the editable score. Aperture opens the incoming picture through its own outline of letters. Register interleaves the pictures in moving strips. The playhead sets that geometry, so seeking back to a position reproduces the same frame. [Rive](https://rive.app/docs/editor/state-machine/state-machine) · [Remotion](https://www.remotion.dev/docs/transitions/) · [Creatomate SDK](https://github.com/creatomate/creatomate-node)

Structured Outputs and the browser Prompt API both support schema-constrained generation. The generated object contains the editable scenes and timing. Pages uses an on-device model when the browser reports one available, with an instant, seeded browser composer on other devices. The optional server adapter uses the same schema with the OpenAI Responses API. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [Web Prompt API proposal](https://github.com/webmachinelearning/prompt-api#structured-output-with-json-schema-or-regexp-constraints)

## Composition API

Run the editor and API on the same origin with Node.js 24 or later.

```sh
node server/story-server.mjs
```

Open `http://127.0.0.1:3000/story/`. The served editor automatically uses the API. The server comes with the seeded Typefield composer. To use a model, set `OPENAI_API_KEY` in the server environment. `TYPEFIELD_MODEL` defaults to `gpt-5-mini` and accepts other Responses API models that support Structured Outputs. Use an authenticated deployment for an internet-accessible server with a paid provider. `TYPEFIELD_HOST` and `TYPEFIELD_PORT` configure the listener.

```sh
curl -fsS http://127.0.0.1:3000/api/stories/compose \
  -H 'Content-Type: application/json' \
  -d '{"brief":"A night train arriving at dawn","seed":4}'
```

`POST /api/stories/compose` takes a brief of 1 to 240 characters and an optional unsigned 32-bit seed. Reusing the same brief and seed with the Typefield composer reproduces the draft. The response contains `source`, a version 2 `score`, and an `editor` path that opens the score directly. The editor imports either a score or that full response. `GET /api/stories/schema` returns the JSON Schema for the score.

A score contains one to four scenes. Each lasts 1.8 to 7.8 seconds in 0.1-second steps. The motions are `turn`, `prism`, `echo`, and `hold`. The transitions are `aperture`, `register`, and `cut`. Old single-scene Exhibit and Story Studio links open with the original word pair and angle. The GitHub Pages release hosts the browser editor. A Node deployment runs the HTTP API and optional model. [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
