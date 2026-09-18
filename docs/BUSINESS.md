# Business Model

> **On the numbers in this document:** every figure below is a *planning assumption*, not a
> measured result. They are written down so they can be tested and replaced with real data
> from the pilot. Treat each one as a hypothesis with an owner and a way to falsify it.

---

## The problem

An UMKM seller listing on Shopee, Tokopedia or TikTok Shop is judged first on a thumbnail.
Their realistic options today:

| Option | Cost | Time | Why it fails them |
|---|---|---|---|
| Phone photo, as-is | Free | Minutes | Cluttered background, bad light — low click-through |
| Learn editing (Canva, Photoroom) | Cheap | Hours, repeatedly | Needs design sense and time they do not have |
| Self-serve AI generators | USD subscription | Minutes | English UI, prompt skills required, output the wrong size, occasional nonsense results |
| Professional studio | Rp500k+ per session | Days, scheduled | Unaffordable for a seller testing a new SKU |

The gap is not image generation — that is commoditised. The gap is **a finished, trustworthy
result with no skill and no commitment required**.

## The wedge

FOTOIN sells a *jasa* (a service), not a tool. The seller's mental model is "I sent my photo
to someone and got good photos back", which is a transaction Indonesian UMKM sellers already
understand and already pay for. The AI is our cost structure, not their interface.

Three consequences follow from that positioning:

1. **A human checks every batch.** This is what makes "jasa" honest and what makes the output
   safe to put on a live listing. It is also our most defensible habit — the rejection data
   from QA is what improves the presets over time.
2. **No prompts, ever.** The seller picks a category and a style. Prompt engineering is our
   job, encoded per vertical in `server/src/data/catalog.js`.
3. **No subscription.** A seller testing one new product pays once. Subscriptions ask for a
   commitment before trust exists.

---

## Target segments

Four verticals, chosen because each has high listing turnover, strong visual dependence, and
existing communities we can reach without paid acquisition.

| Segment | Why them | Visual need | Where to reach them |
|---|---|---|---|
| **Kuliner** — frozen food, catering, snacks | Constant new SKUs; food is bought with the eyes | Appetising, clean, consistent | Food-seller WhatsApp/Facebook groups, local UMKM associations |
| **Fashion & Hijab** | Highest listing turnover; modest fashion is a large domestic market | Accurate fabric colour and texture | Modest-fashion communities, reseller networks |
| **Kerajinan & Dekor** | Handmade goods need scale and context to sell | Lifestyle framing, sense of size | Craft marketplaces, Dekranasda / craft fairs |
| **Skincare & Kosmetik lokal** | Crowded category; presentation *is* the brand | Premium, clinical, consistent | Beauty reseller groups, local brand incubators |

**Primary persona.** A seller running the business from home, listing on 2–3 marketplaces,
with no design skill, no budget line for photography, and a phone as their only camera. They
already run their business through WhatsApp.

---

## Pricing

Pay per pack, Rp15.000–Rp25.000. The band is chosen to sit below the threshold where a home
seller stops to think — roughly the price of lunch — so trying FOTOIN is not a decision that
needs discussing with anyone.

| Pack | Price | Photos | Styles | Marketplaces | Turnaround | Free revisions |
|---|---|---|---|---|---|---|
| Hemat | Rp15.000 | 5 | 1 | 1 | ~6 h | 0 |
| **Standar** | **Rp20.000** | **10** | **3** | **3** | **~3 h** | **1** |
| Premium | Rp25.000 | 15 | 5 | 4 (+ Instagram) | ~1 h | 2 |

Standar is positioned as the default: it is the middle option, carries the "Terlaris" badge,
and is the first pack that covers a seller's realistic multi-channel need.

Canonical definition: `server/src/data/catalog.js` → `PACKS`. A test asserts prices stay
inside the band and that packs improve monotonically with price.

### Unit economics (assumptions to validate)

Per Standar pack, Rp20.000:

| Line | Assumed | Notes |
|---|---|---|
| AI generation | Rp3.000–6.000 | 10 images; depends entirely on the model chosen |
| Human QA | Rp4.000–6.000 | ~3 min at Rp80–120k/day; the number to drive down |
| Payment fee (QRIS) | ~Rp140 | 0.7% MDR |
| Storage, bandwidth, infra | Rp500 | |
| **Contribution margin** | **~Rp8.000–12.000 (40–60%)** | Before acquisition and overhead |

**The margin lever is review time, not generation cost.** Generation cost falls on its own as
models get cheaper. QA time only falls if the presets get good enough that a reviewer approves
a batch in one glance. That is why every rejection stores a reason — the rejection log is the
roadmap for preset improvement.

**Break-even sensitivity.** At ~Rp10.000 contribution, fixed costs of Rp5jt/month need ~500
packs/month. Whether that is 150 sellers ordering 3–4 times or 500 one-off sellers is the
single most important thing the pilot must answer, because it determines whether this is a
retention business or an acquisition business.

---

## Key assumptions, and how to test each one

| # | Assumption | Test | Kills the business if |
|---|---|---|---|
| A1 | Sellers will pay Rp15–25k rather than use a free tool | Charge from day one in the pilot; no free tier | Conversion from "interested" to "paid" is under ~10% |
| A2 | Human QA can average ≤3 min per order | Time every review in the pilot | QA stays above ~6 min and margin never arrives |
| A3 | Sellers reorder | Track repeat rate over 60 days | Repeat rate under ~20% — acquisition cost eats everything |
| A4 | WhatsApp ordering beats the web app | Offer both; compare completion rates | Neither channel completes, meaning the brief itself is too hard |
| A5 | Marketplace-ready sizing is a real reason to choose us | Ask in exit interviews; watch which outputs get downloaded | Sellers only ever use one size |
| A6 | Output quality is good enough to list without editing | Track how many delivered images appear on live listings | Sellers re-edit what we send |

A1 and A2 are the two that decide whether this is a business. Test them first, with real
money and a stopwatch.

---

## Go-to-market

**Phase 1 — 20 sellers, one vertical (Kuliner), manual everything.**
Recruit by hand from food-seller groups. Run the pipeline with the founders as reviewers.
The goal is not revenue; it is the rejection log and the QA stopwatch.

**Phase 2 — WhatsApp-first ordering, 3 verticals.**
Open the intake bot. Add a referral incentive (a free pack for a referral that converts) —
this segment moves on word of mouth inside closed groups, not on ads.

**Phase 3 — partnerships.**
UMKM associations, Dekranasda, and marketplace seller-education programmes. Offer a bulk
onboarding rate so an association can buy packs for a cohort.

Paid acquisition is deliberately last. If word of mouth inside a seller community does not
work, paid ads at a Rp20.000 price point will not rescue the unit economics.

---

## Competitive position

| | Self-serve AI (Photoroom, Canva) | Freelance editor | Photo studio | **FOTOIN** |
|---|---|---|---|---|
| Price | USD subscription | Rp50–150k/batch | Rp500k+/session | **Rp15–25k/pack** |
| Skill needed | Prompt + design | Brief writing | Coordination | **Pick a category** |
| Turnaround | Minutes | 1–3 days | 3–7 days | **1–6 hours** |
| Quality floor | None — you ship what you get | Varies by person | High | **Human-checked** |
| Marketplace sizing | Manual | Sometimes | Manual | **Automatic** |
| Language / channel | English web | WhatsApp | In person | **Bahasa, WhatsApp** |

**What is actually defensible.** Not the model — anyone can call the same API. It is the
accumulated per-vertical preset library tuned by real rejection data, the trust of a service
that has never shipped an embarrassing image, and distribution inside seller communities. All
three compound with volume; none of them can be copied by switching providers.

**The honest risk.** A marketplace could ship "AI photo cleanup" natively inside the Shopee or
TikTok seller app and reach every seller for free. The hedge is to be the multi-channel,
human-checked option — a seller listing on three platforms still needs one consistent set of
images, and still needs someone to be accountable when a result is wrong.
