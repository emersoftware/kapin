# KAPIN

> An agent that audits your code and tells you where to start measuring to improve your product

---

**Built during [the agent hackathon](https://hack.skyward.ai/) organized by [Skyward.](https://skyward.ai/) and [CommunityOS](https://communityos.io/)**
_learnings documented at the end of this readme_

---

## What does kapin do?

Kapin integrates with github, allowing you to create projects (think of a project as a software product) using one or multiple repositories.

the workflow:
1. **connect** your github account
2. **create a project** with your repositories
3. **analyze** your codebase to identify main features
4. **generate** a list of metrics you should start measuring
5. **implement** metrics using the provided instructions

```
your code → feature detection → actionable metrics
```

each metric includes implementation instructions.

---

## Structure

this repository contains 3 main directories:

1. `web-worker/`
nextjs application (open nextjs) ready to deploy as a cloudflare worker

2. `agents-worker/`
cloudflare worker using langgraph and langchain for agent orchestration

3. `sandbox-worker/`
cloudflare worker for managing sandboxes _(note: currently broken due to migration to e2b sandboxes)_

### Key components

- **sandbox**: e2b sandboxes for cloning repositories and exploring code using commands like `grep`, `cat`, `ls`, etc.
- **workflow**: langgraph workflow with three agents: a "topic" finder and two metric generators
- **agents**: built with langchain, using two tools:
  - execute commands in the sandbox
  - read complete file contents
- **llms**: started with anthropic claude haiku 4.5, switched to groq (gpt-oss-120b) for faster workflow execution

---

## Pivots

- **initially** wanted to use langchain python stack, but it's still in beta for cloudflare workers
- **pivoted** to langchain js
- **initially** planned to use cloudflare sandboxes, but didn't have the required plan access
- **pivoted** to e2b sandboxes

---
## Roadmap (if I get motivated)

- open prs with the changes needed to implement the metrics (database migrations, data layer)
- database read access to show the metrics in the app
---
## Learnings from the hackathon

my 1st hackathon

### Time management
- **don't waste time on complex integrations** — i spent too much time building github oauth integration to clone user repos. instead, I could have just used public repos from github to test the core functionality faster

### Choose your focus
- **learning new technologies?** i chose to learn cloudflare workers, which meant dealing with:
  - opennextjs on cloudflare workers (postgres tcp driver has connection reuse bugs — had to switch to neon's http driver)
  - python workers (still in beta)
  - langchain js (different from python version)

  this cost me significant time troubleshooting. i could have deployed with familiar technologies (vercel, railway, etc.) and avoided these blockers. choose learning or shipping fast — it's hard to do both in a hackathon

- **building to win?** i chose to build a project i'd wanted to create for months, which didn't align with the judges' criteria. if winning is your priority, read the evaluation rubrics beforehand and align your project with them. in this hackathon, social impact was a key criterion that i didn't address. you can build what you love or build to win (or both) - just know which one you're choosing

### Team dynamics
- **going solo?** i went alone (one-man show), which limited my knowledge and troubleshooting capacity. when you hit a blocker, there's no one to brainstorm with or take over while you rest

- **going with a team?** teams can achieve more, but work with people you already know and trust. joining strangers can create discord rather than synergy, especially under time pressure

### Networking matters
- **hackathons aren't just about building cool stuff** — they're also about meeting cool people. i didn't realize this until late at night when an organizer approached me and said "go meet people!" i'm introverted and often not interested in socializing, but i regret not talking more with the people. if you're like me, set a reminder to take ~~networking~~ netfriending breaks — future you will thank you

### Ask mentors for help
- **most hackathons have mentors** — they're there to help you with technical issues, product strategy, and proof of concept feedback. don't be shy, talk to them and ask questions. even if there aren't official mentors, ask any organizer — nobody will say no. i should have asked for help more often instead of getting stuck troubleshooting alone

---