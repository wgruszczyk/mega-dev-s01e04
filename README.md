# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

`GET /api/digest/:night` returns `{ rows, badLines }` from the shared run log reader,
with rows sorted by job. Missing or invalid night names return 404.

The final, marker-free review page is saved as [docs/preview/index.html](docs/preview/index.html).
It is the same self-contained HTML published on [GitHub Pages](https://wgruszczyk.github.io/mega-dev-s01e04/).
