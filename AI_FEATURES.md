# AI feature ideas for GameQueue

GameQueue's core job is "what do I play next?". It holds a personal collection with statuses, playthroughs (with optional dates), 1-5 ratings, private notes, tags, IGDB metadata (genres, platforms, score, time to beat), a queue, slots, a wishlist, smart lists, stats and a yearly recap. That is a rich taste profile, and every decision on top of it is rule-based today (filters, smart-list rules, random pick). AI fits best where the answer is fuzzy or needs language: mood, taste, "something like X", and writing.

The ideas below are **ordered from cheapest to most expensive** to run. "Cost" means the per-use model cost (tokens in and out, how often it runs) plus how much new code it needs. Each idea also has a **Local (Ollama on the Pi)** verdict.

## Legend

| Mark                    | Meaning                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 🟢 **Pi-friendly**      | Small input, short or structured output. A small local model should handle it.                         |
| 🟡 **Pi, with caveats** | Possible, but only with a trimmed input, a background job, or a different technique (e.g. embeddings). |
| 🔴 **Hosted only**      | Needs a big context, strong reasoning or reliable tool use. Not realistic on a Pi.                     |

Token counts and model sizes below are my estimates, not measurements. Nothing here has been run on your Pi.

## How realistic is a Pi?

Assumptions (verify before building on them): a Raspberry Pi 5 with 8 GB RAM, CPU-only, running a 1-4B parameter quantized model (for example Llama 3.2 3B, Qwen 2.5 1.5B/3B, Phi-3.5 mini, or Gemma 2B class). Expect single-digit tokens per second for output, and slow prompt processing, so a prompt of a few thousand tokens can take tens of seconds to minutes. Smaller models also follow instructions and know games much less reliably than the hosted ones.

What that means for design:

- **Keep inputs short.** Under about 1,000 tokens is comfortable; 10,000+ is not.
- **Force structure.** Ollama can constrain output to a JSON schema (the `format` parameter), which makes small models far more dependable for the "turn text into our Zod schema" features.
- **Prefer embeddings over generation** where possible. Ollama serves embedding models (such as `nomic-embed-text`) that are small and fast on a Pi, and "mood matching" is really a similarity problem.
- **Run slow work in the background** and cache it, rather than making a user wait on a request.
- **Don't trust a small model's game knowledge.** Ground answers in IGDB data you pass in, never in what the model "remembers".
- The Pi is also running the app server and SQLite. Inference will compete with it for CPU and RAM, so run it one request at a time (a queue) and set a timeout.

## Design principles (apply to every feature)

- **Suggest, never act.** AI proposes; the user confirms. It never changes status, slots, the queue or ratings by itself. This matches the existing "assigning from the queue is manual" decision.
- **Opt-in and optional.** The app must work fully with no AI configured. AI routes are disabled and the UI entry points hidden when no provider is set.
- **Provider-agnostic.** One small interface (`generate(prompt, schema)` and `embed(texts)`) with two implementations: Anthropic (hosted) and Ollama (local, `OLLAMA_URL` + model name). Config picks one, and ideally can pick per feature so cheap features go local and heavy ones go hosted. A fake implementation serves tests.
- **Privacy.** Notes, email and real name are private today. Send the minimum the feature needs; notes only for features that say so, and never for public-profile content. The local option has a real privacy benefit: nothing leaves the home network.
- **Ground it in the user's data.** The model picks from or reasons about games already in the collection or IGDB results, referenced by `entryId`/IGDB id. Validate every returned id server-side and drop unknown ones.
- **Structured output.** Tool use / JSON schema outputs validated with Zod in `packages/shared`, like the rest of the API.
- **Cost control.** Cache results per user and input hash, use prompt caching for the shared system prompt on the hosted side, and rate-limit per user like the login limiter.

---

## Ideas, cheapest first

### 1. Auto-tagging 🟢

**Cost:** Lowest. Input is one game's IGDB summary, genres, themes and keywords (a few hundred tokens); output is a handful of tags. The result depends only on public metadata, so it can be **cached per IGDB id and shared across users**: each game is tagged at most once, ever. Hosted: a small model (Haiku) is plenty.

**What:** Suggest tags for new games using the user's own existing tags as the vocabulary ("cozy", "co-op", "short-session", "comfort-game"). The user accepts or rejects chips. Variant: a bulk "Tag my untagged games" review screen.

**Why:** Tags power filters, smart lists and pick, but typing them for hundreds of games is the barrier.

**Local (Ollama):** 🟢 Best candidate. Short input, small structured output, run as a background job over the untagged games with results cached. Constrain output to the user's existing tag list so a weak model can't invent noise. Speed doesn't matter because nobody waits on it.

### 2. Natural-language smart lists 🟢

**Cost:** Very low. A short sentence in, a small JSON object out. Prompt includes the rules schema and the facet values (`GET /entries/facets`), roughly 500-1,500 tokens. The model translates language to rules; it never picks games, so every later read of the list is free and deterministic.

**What:** Type "short games I haven't touched in a year with a good score" and get a smart list built from the existing rule model (status, platform, genre, tag, year finished, number fields with at least/at most/unknown, sort).

**How:** Use the existing smart-list rules Zod schema as the tool/format schema and validate the result. On failure show "I couldn't build that" and open the blank editor. The user reviews the rules in the existing editor before saving.

**Local (Ollama):** 🟢 Good fit, with JSON-schema-constrained output. A 3B model can map "short" to a time-to-beat limit and "good score" to an IGDB-score minimum most of the time, and the user sees and can fix the rules. Expect a response in roughly 10-30 seconds; show a skeleton. Keep the facet list trimmed to what's relevant.

### 3. Natural-language playthrough logging 🟢

**Cost:** Very low. One sentence in, one small object out.

**What:** "I finished Elden Ring on PS5 last Saturday, 5 stars" becomes a past-playthrough log (game, platform, dates, rating) shown for confirmation. Handy because dates can be unknown and logging old games is tedious.

**How:** The model extracts fields; the game is matched through the existing search; the date is resolved by the server from the client's local date, not by the model.

**Local (Ollama):** 🟢 Plain information extraction, which small models are decent at. Resolve relative dates in code.

### 4. Notes helper (private) 🟢

**Cost:** Low. Input is one game's notes (a few hundred tokens), output a short summary or draft review, only when the user clicks.

**What:** On a game's notes: "Summarize my notes". On a finished playthrough: "Draft a short review from my notes and rating". The user edits and saves; nothing is stored automatically.

**Local (Ollama):** 🟢 Strongest privacy case of all: notes are the most private data in the app, and a local model means they never leave the house. Quality from a 3B model is fine for short summaries.

### 5. Import helper (title cleanup) 🟡

**Cost:** Low per game but scales with list size (hundreds of titles).

**What:** Paste a plain-text list of games (spreadsheet, Steam dump). The model normalizes noisy titles ("ELDEN RING - Deluxe Edition (PC)") into search queries, which are matched against IGDB, then the existing merge import runs.

**Local (Ollama):** 🟡 Fine in small batches as a background job. Much of this can be done with plain string cleanup first; use the model only for titles that fail to match.

### 6. Year in review narration 🟢

**Cost:** Low overall. One call per user per year with the already-computed recap payload (about 1-2k tokens in, a few short paragraphs out), cached. A mid-size model (Sonnet) gives the nicest writing, but a small one is acceptable.

**What:** An optional written summary on `/recap`: the year's themes, a game-of-the-year blurb, a playful caption or two. It may only cite supplied numbers. If the recap is public, the text is public too, so show a preview and require approval before it appears at `/u/:username/recap`.

**Local (Ollama):** 🟢 One-off and cacheable, so the slow speed doesn't matter; generate in the background. Trade-off is blander prose and a higher chance of a wrong claim, which is why the approval step and the "only cite supplied numbers" rule matter.

### 7. Backlog triage and "why am I not finishing games?" 🟡

**Cost:** Low to medium. Input is a summarized list of stale or abandoned games (name, length, genre, last changed), not the whole library.

**What:** Surface games unplayed for 2+ years and ask "still interested?", suggesting keep / wishlist-ify / remove with reasons. A read-only insight on traits shared by abandoned games.

**Local (Ollama):** 🟡 Do the statistics in code (it's mostly counting), and use the model only to word the insight. Then the prompt is small enough for a Pi.

### 8. Pick for my mood 🟡

**Cost:** Medium. Per request the candidate list is the expensive part: about 200 candidates at 50-100 tokens each is 10-20k tokens in. Mitigate by pre-filtering with the existing structured filters and sampling. Hosted: Haiku with a candidate cap; use prompt caching for the system prompt.

**What:** A text box on the Pick page: "something short and cozy for a weeknight", "co-op, nothing scary". The model chooses from the backlog (or a list/queue/smart list, plus paused if the toggle is on) and explains each choice in a sentence. Builds on `packages/shared/src/pick.ts`; the existing filters stay the source of candidates.

**How:** Candidates carry `entryId`, name, genres, themes, time to beat, IGDB score, tags, platform (notes excluded). Model returns up to 3 `{entryId, reason}`; the server validates ids against the candidate set. The UI offers the usual Start / Queue / Slot actions and a plain-random fallback.

**Local (Ollama):** 🟡 A generative approach does not fit a Pi: a big candidate list means a very slow prompt, and a 3B model ranks poorly. Two workable variants:

- **Embeddings (recommended local approach):** embed each game's metadata once (cached in SQLite), embed the mood text on request, and rank by cosine similarity. That is a fast, cheap request even on a Pi, and the "reason" can come from the matching tags/genres rather than the model.
- **Small LLM on a short list:** shortlist about 20-30 candidates with embeddings or filters, then let the model write the one-line reasons.

### 9. Queue assistant 🔴/🟡

**Cost:** Medium to high. It needs the queue, a sample of the backlog, current slots and recent finishes with ratings, so the input is several thousand tokens, and good ordering needs a stronger model (Sonnet). Run on demand.

**What:** "Suggest my queue order" proposes an order (or a few backlog games to add) with one-line reasons: genre/length variety, a short game between two long ones, finish what's close to done. Shown as a diff; "Apply" calls the existing `PUT /queue/order`.

**Local (Ollama):** 🔴 for the full version: it's a multi-constraint reasoning task over a long input, which small models do badly. 🟡 for a reduced version: sort in code by simple rules (alternate long/short, spread genres) and have the model only word the reasons.

### 10. More-like-this recommendations 🟡/🔴

**Cost:** Medium to high. The model generates names, then each is resolved through the IGDB client (4 requests/s, so batches take time), and results are filtered against owned and wishlisted games. Roughly 1-3k tokens of LLM use plus several IGDB calls per request.

**What:** From the highest-rated games, recommend ones the user doesn't own, with a one-click wishlist add. Also per game: "Games like this one". Anything not found in IGDB is dropped, so hallucinated titles can't appear.

**Local (Ollama):** 🔴 for name generation: a small model's knowledge of games is thin and it will invent titles, so most results would be thrown away. 🟡 alternative that needs no LLM at all: use IGDB's similar-games data and embeddings to rank, with an optional model-written "why you might like it" line.

#### How recommendations would work

The model proposes titles; the server checks every one against IGDB and the user's own data before anything is shown.

1. **Build a taste profile (no AI).** From existing data: top-rated finished games (4-5 stars, capped at 20-30) with genres, themes and rating; a few abandoned games as negative signal; the most common genres and tags; and the names of everything already owned or wishlisted, so the model avoids them. Notes are never included. About 2-3k tokens.
2. **Ask the model for candidates.** One call with a structured-output schema `[{ title, year?, why }]`, capped at around 15. The prompt asks for real, released games and says to leave out titles it is unsure about. This is the only step that needs game knowledge, so it is the one that uses the larger model (Sonnet 5.5).
3. **Resolve each title through IGDB** with the existing search client, using the year to pick the right match. No match means the model invented it, so it is dropped. The existing `EXCLUDED_TYPES` filter and `version_parent = null` query still apply. IGDB's 4 requests/second limit means about 15 lookups take a few seconds, so run them in the background or behind a skeleton.
4. **Filter against the user's data.** Drop anything owned (match on `igdb_id`), anything already wishlisted, and anything previously dismissed. Dedupe and trim to about 8.
5. **Optional blurbs.** A cheap Haiku call writes a one-line "why you might like it" per survivor, grounded in the user's games it resembles. Or reuse the `why` from step 2 and skip this call.
6. **Show the results** with the existing search-result components (cover, IGDB score gauge, blurb), an **Add to wishlist** button (the existing `POST /api/wishlist/items`) and a **Dismiss** button. Cache the response per user and invalidate it when ratings change, so reloading the page does not call the API again.

Design choices:

- **Dismissals** are stored (a small table keyed by IGDB id) and fed back into step 1 as "don't suggest again"; otherwise rejected games keep returning.
- **Per-game variant ("games like this one")** runs the same pipeline with a profile of just that game's genres and themes. IGDB's similar-games field could supply the candidates, with the model only ranking and explaining.
- **No-LLM fallback:** take IGDB's similar-games lists for the top-rated games, count how often each candidate appears and rank by that. Weaker, but free and usable without a key.
- **Empty results:** if nothing survives filtering, show "no new suggestions" rather than retrying in a loop.
- **Tests** use the fake AI provider with fixed titles and `fakeIgdb` to resolve them, covering unknown title dropped, owned game dropped and wishlisted game dropped, with no live calls.

Risks:

- The model may lean toward famous games. Asking for lesser-known picks, or a "surprise me" option, helps.
- A short or common title could resolve to the wrong game. Passing the year and requiring a close name match reduces this.
- With fewer than about 5 rated games there is little to go on. Say so and fall back to the IGDB-similar approach.

### 11. Conversational assistant ("Ask your collection") 🔴

**Cost:** Highest. Multi-turn, tool use against read services, long tool outputs fed back each turn, and it is open-ended so spend is hard to cap. Needs a strong model (Sonnet or better) for reliable tool calling.

**What:** A read-only chat: "what did I rate highest last year?", "anything on Switch under 10 hours I haven't started?", "what should I play after Hades?". Tools are scoped to the logged-in user and cannot change data.

**Local (Ollama):** 🔴 Not realistic on a Pi. Reliable multi-step tool calling needs a larger model, and the latency over several turns would be painful. Many of these questions are already answerable with filters, smart lists and stats, and feature 2 covers the common case, so treat this as a later step.

---

## Summary table

| #   | Feature                              | Relative cost                    | Local on Pi                       |
| --- | ------------------------------------ | -------------------------------- | --------------------------------- |
| 1   | Auto-tagging                         | Lowest (cached per game, shared) | 🟢 Best candidate                 |
| 2   | Natural-language smart lists         | Very low                         | 🟢 With JSON-schema output        |
| 3   | Natural-language playthrough logging | Very low                         | 🟢                                |
| 4   | Notes helper                         | Low                              | 🟢 Best privacy case              |
| 5   | Import helper                        | Low, scales with list size       | 🟡 Background batches             |
| 6   | Recap narration                      | Low (once per year, cached)      | 🟢 Background, with approval step |
| 7   | Backlog triage                       | Low to medium                    | 🟡 Compute stats in code          |
| 8   | Pick for my mood                     | Medium                           | 🟡 Embeddings, not generation     |
| 9   | Queue assistant                      | Medium to high                   | 🔴 / 🟡 reduced version           |
| 10  | Recommendations                      | Medium to high                   | 🔴 / 🟡 IGDB + embeddings         |
| 11  | Conversational assistant             | Highest                          | 🔴                                |

**Takeaway:** features 1 to 4 and 6 are cheap on the hosted API and also run acceptably on a Pi. Feature 8, the headline one, is best served locally by embeddings rather than a chat model. Features 9 to 11 are where a hosted model earns its cost.

## Estimated monthly cost (single user, hosted API)

These are estimates, not measurements; nothing has been run against the API. Prices are first-party API rates as cached in the Claude API reference on 2026-10-06 and may change, so check current pricing before relying on them.

| Model                            | Input per 1M tokens | Output per 1M tokens              |
| -------------------------------- | ------------------- | --------------------------------- |
| Sonnet 5.5 (`claude-sonnet-5-5`) | $2.00               | $10.00                            |
| Haiku 5.5 (`claude-haiku-5-5`)   | $0.10               | $0.50 (prompts up to 100K tokens) |

Thinking tokens bill as output, so output estimates are padded for them.

| Feature                                  | Model                                   | Roughly per use          | Assumed occasional use | Monthly         |
| ---------------------------------------- | --------------------------------------- | ------------------------ | ---------------------- | --------------- |
| Chat assistant                           | Sonnet 5.5                              | ~$0.05-0.07 per question | 20 questions           | ~$1.20          |
| Recommendations                          | Sonnet 5.5 for titles, Haiku for blurbs | ~$0.04 per request       | 10 requests            | ~$0.40          |
| Queue assistant                          | Sonnet 5.5                              | ~$0.04                   | 4 uses                 | ~$0.15          |
| Mood picker                              | Haiku 5.5                               | ~$0.002                  | 30 picks               | ~$0.06          |
| Natural-language smart lists             | Haiku 5.5                               | under $0.001             | a few                  | ~$0.00          |
| Auto-tagging                             | Haiku 5.5                               | ~$0.0003 per game        | 500 games, once        | ~$0.15 one-time |
| Notes helper, playthrough logging, recap | Haiku or Sonnet                         | fractions of a cent      | a few                  | pennies         |

**Overall:** roughly $1-3 a month for occasional use of everything, and under about $10 even with heavy use.

- The chat assistant costs the most because every tool-call round re-sends the conversation and tool definitions (assumed about four rounds and 20k input tokens per question). At 100 questions a month it would be about $6; prompt caching would reduce that.
- Opus or Fable instead of Sonnet would cost roughly 2-5x more per token. Higher effort and more tool rounds add thinking tokens, which is the biggest uncertainty here. A large collection lengthens the mood picker's candidate list.
- API usage is billed separately from any Claude subscription and needs an API key with credits. Set a monthly spend limit in the Anthropic Console as a backstop in addition to the in-app rate limit.
- Running the cheap features (1-4 and 6) on the Pi through Ollama costs $0 in API fees, leaving only chat and recommendations on the API at about $1.50 a month for occasional use.

## Model recommendations for the expensive features

- **Chat assistant: Sonnet 5.5.** It makes several tool calls in a row and then answers from the results; reliable tool calling matters, and a wrong answer about the user's own library makes the feature feel broken. Optionally route simple single-lookup questions to Haiku 5.5, but start with Sonnet alone. Opus and Fable are probably overkill because the tools do the heavy lifting.
- **Recommendations: Sonnet 5.5 for generating titles, Haiku 5.5 for the rest.** Game knowledge matters for naming titles, and a larger model invents fewer. Every title is still checked against IGDB, so a wrong one wastes a lookup instead of reaching the UI. A cheaper variant feeds IGDB's similar-games data in as candidates and lets Haiku only rank and explain.
- **Cost controls for both:** prompt caching for the system prompt and tool definitions, a cap on tool-call rounds per question and on each tool result's size, a per-user rate limit, and recommendations cached until ratings change.

## Suggested order to build

1. **Provider interface + Ollama and Anthropic implementations + fake for tests.** Everything else depends on it, and it lets you try local first at no per-token cost.
2. **Natural-language smart lists** (2): small, safe, output is existing validated rules; a good first test of how a Pi-sized model behaves.
3. **Auto-tagging** (1): improves the data that features 2 and 8 rely on.
4. **Pick for my mood** (8) via embeddings, optionally with LLM-written reasons.
5. **Notes helper** (4) and **recap narration** (6).
6. The rest as demand shows; 9 to 11 are likely hosted-only.

## Implementation sketch

- `apps/server/src/ai/` with the provider interface and two implementations; config chooses the provider (and optionally one per feature): `AI_PROVIDER=ollama|anthropic|none`, `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`, `ANTHROPIC_API_KEY`. Injectable so tests use a fake, as with `fakeIgdb`.
- Serialize local inference through a single in-process queue with a timeout, so a slow request can't starve the app or pile up on the Pi.
- Embeddings stored in SQLite (a table keyed by IGDB id and model name; re-embed when the model changes). At this scale (hundreds to low thousands of games) brute-force cosine similarity in JS is enough, with no vector database.
- One service per feature that builds the prompt from existing services and validates the output; routes under `/api/ai/*` behind `requireAuth` and a per-user rate limit.
- Zod request/response schemas in `packages/shared`.
- Web: each entry point ships with its own loading skeleton (local models are slow, so make that skeleton honest), a clear "AI suggestion" label, and an accept/dismiss step.
- Tests use the fake provider for the happy path, invalid ids dropped, disabled when unconfigured, timeout, and rate limiting. No tests hit a live model.
- `ARCHITECTURE.md` gets an AI section when the first feature lands; `.env.example` gains the settings.

## Open questions

- Is the Pi a Pi 5 with 8 GB (or what model/RAM)? That decides whether a 3B model is comfortable or only 1.5B is.
- Local-first (cheap, private, slower, less capable) with hosted as an optional upgrade, or hosted-first with local as a fallback?
- Should notes ever be sent to a hosted API, or only to a local model?
- Which first: natural-language smart lists, auto-tagging, or the mood picker?
