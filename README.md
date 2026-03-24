# The Rarest Heart

**Technology with a Heartbeat.**

[therarestheart.io](https://therarestheart.io)

---

## What is TRH?

The Rarest Heart is a technology education and IT support company built for three audiences at once:

- **Youth & beginners** who want to understand how technology actually works
- **Aspiring IT professionals** breaking into Help Desk, IT Support, and cybersecurity
- **Small business owners** who need reliable, human-centered tech support

We teach real IT skills — Tier 1 through Tier 2 — without gatekeeping, without jargon walls, and without assuming you already know.

## The TRH Method

Every topic follows one framework:

| Phase | What it is | What you get |
|-------|-----------|--------------|
| **Learn IT** | The concept explained like a human being | Context, plain language, real analogies |
| **Do IT** | Hands-on step-by-step execution | SOPs, screenshots, labs designed to break |
| **Apply IT** | Turn skills into career language | Resume bullets, interview prep, ticket documentation |

## Tech Stack

- **Frontend:** HTML / CSS / JavaScript (no frameworks)
- **Fonts:** Syne · IBM Plex Mono · DM Sans
- **Hosting:** Cloudflare Pages
- **Domain:** therarestheart.io (Cloudflare DNS)
- **Deployment:** Auto-deploy on push to `main`

## Project Structure

```
therarestheart.io/
├── index.html                          # Homepage (locked design)
├── learn.html                          # Learn IT — module library
├── modules/
│   └── 01-password-resets.html         # Module 1 — Password Resets (SOP-001)
├── images/
│   └── trhlogo.svg                     # TRH logo
└── README.md
```

### Pages — Build Status

| Page | Status | Description |
|------|--------|-------------|
| `index.html` | ✅ Built | Homepage — locked, do not redesign |
| `learn.html` | ✅ Built | Learn IT — curriculum entry point |
| `modules/01-password-resets.html` | ✅ Built | Module 1 — canonical template for all modules |
| `do.html` | 🔲 Next | Do IT — hands-on SOP execution |
| `apply.html` | 🔲 Planned | Apply IT — resume + interview prep |
| `topics.html` | 🔲 Planned | Full topic library / index |
| `contact.html` | 🔲 Planned | Contact form / booking |
| `assistant.html` | 🔲 Phase 2 | Local AI assistant interface |

### Modules — Build Status

| Module | Topic | Tier | Status |
|--------|-------|------|--------|
| 01 | Password Resets & Account Lockouts | Tier 1 | ✅ Built |
| 02 | Wi-Fi & Network Connectivity | Tier 1 | 🔲 Planned |
| 03 | Software Installation & Errors | Tier 1 | 🔲 Planned |
| 04 | Malware Detection & Removal | Tier 2 | 🔲 Planned |
| 05 | Windows Performance Diagnostics | Tier 2 | 🔲 Planned |
| 06 | Active Directory User Support | Tier 2 | 🔲 Planned |
| 07 | Cabling & Physical Layer | Tier 1 | 🔲 Planned |
| 08 | Security Hardening Basics | Tier 2 | 🔲 Planned |

## Design System

The site uses a consistent design system across all pages:

- **Palette:** Navy (`#07081a`) background, off-white (`#f4f4f0`) text, accent blue (`#4a6cf7`), pulse red (`#e84a6f`)
- **Typography:** Syne for headings, IBM Plex Mono for labels/code, DM Sans for body
- **Effects:** Noise overlay, scroll reveal animations, subtle glow accents
- **Layout:** All new pages must match the existing `index.html` design system exactly

## Philosophy

**People + Process + Tool** — in that order, always.

Every SOP, every module, and every piece of content starts with the person first. The process exists to support them. The tool is just how we get it done.

## Building in Public

TRH is being built publicly. The journey — the SOPs, the curriculum, the website, the mistakes — is part of the brand. Follow along:

- **Website:** [therarestheart.io](https://therarestheart.io)
- **GitHub:** [github.com/the-rarest-heart](https://github.com/the-rarest-heart)

## License

© 2026 The Rarest Heart. All rights reserved.
