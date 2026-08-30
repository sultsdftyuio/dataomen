export type ResourceSection = {
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  steps?: readonly {
    title: string;
    description: string;
  }[];
};

export type ResourceFaq = {
  question: string;
  answer: string;
};

export type ResourceGuide = {
  slug: string;
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  summary: string;
  sections: readonly ResourceSection[];
  faqs: readonly ResourceFaq[];
  relatedSlugs: readonly string[];
};

export const RESOURCE_LAST_MODIFIED = new Date("2026-08-30T00:00:00.000Z");

export const resourceGuides: readonly ResourceGuide[] = [
  {
    slug: "buyer-intent-signals",
    path: "/resources/buyer-intent-signals",
    eyebrow: "Buyer intent guide",
    title: "Buyer Intent Signals: What They Are and How to Use Them",
    description:
      "Learn how B2B founders can recognize buyer-intent signals, evaluate public conversations, and prioritize evidence-backed opportunities.",
    summary:
      "Buyer-intent signals are observable clues that someone may be actively trying to solve a problem. The strongest signals combine specific language, relevant context, and a recent reason to act.",
    sections: [
      {
        title: "What counts as a buyer-intent signal?",
        paragraphs: [
          "A buyer-intent signal is not a demographic label or a random keyword. It is an observable action or statement that suggests a person or company may be dealing with a problem your product solves.",
          "For a public-conversation workflow, the signal should be strong enough that a human can understand why it was surfaced. A useful candidate shows the original wording, the source, the surrounding context, and the reason it may matter now.",
        ],
        bullets: [
          "An explicit request for a recommendation, tool, specialist, or workaround.",
          "A description of a costly or recurring problem in the buyer's own words.",
          "A comparison, replacement, budget, trial, or implementation question.",
          "A recent business change that makes the problem more urgent, such as a launch, growth milestone, or new process.",
        ],
      },
      {
        title: "Separate signal strength from surface activity",
        paragraphs: [
          "Not every public post is buying intent. Someone discussing a topic, sharing a tutorial, or asking a theoretical question may be useful research but is not necessarily a prospect.",
          "Treat public signals as leads for human review, not proof that a person wants to buy. This keeps the prospect queue useful and prevents a large volume of weak matches from disguising itself as pipeline.",
        ],
        bullets: [
          "Strong: the person names a present problem, asks for help, and fits the audience you serve.",
          "Plausible: the problem is real, but the person's role, timing, or fit is unclear.",
          "Research only: the post teaches, comments on, or debates the topic without a current need.",
        ],
      },
      {
        title: "A practical way to use signals",
        steps: [
          {
            title: "Define the buyer and the problem",
            description:
              "Write down who you help, the costly problem they are trying to solve, and the situations where they start looking for help.",
          },
          {
            title: "Collect natural language",
            description:
              "Use customer calls, support tickets, reviews, and your website to identify phrases buyers would actually write—not internal sales language.",
          },
          {
            title: "Look for evidence, not keyword hits",
            description:
              "Evaluate the complete conversation, its recency, and the author context before treating it as an opportunity.",
          },
          {
            title: "Review before acting",
            description:
              "Keep the original link and the matching reason visible, then decide whether a thoughtful, relevant response is appropriate.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Is a buyer-intent signal proof that someone will buy?",
        answer:
          "No. It is evidence worth reviewing. A good signal makes the decision easier by showing a relevant, recent problem in context, but it does not guarantee a sale.",
      },
      {
        question: "What is the difference between intent and an ICP filter?",
        answer:
          "An ICP filter describes who you want to sell to. Intent shows who may have a reason to care now. Useful prospecting needs both.",
      },
      {
        question: "Can public conversations be used responsibly?",
        answer:
          "They should be treated as public context for research and human review. Do not infer sensitive information, collect private content, or use a weak signal as a reason to send mass outreach.",
      },
    ],
    relatedSlugs: [
      "how-to-find-b2b-buyers",
      "public-conversation-lead-generation",
      "buyer-pain-point-research",
    ],
  },
  {
    slug: "how-to-find-b2b-buyers",
    path: "/resources/how-to-find-b2b-buyers",
    eyebrow: "Prospecting guide",
    title: "How to Find B2B Buyers Who Are Actively Looking for Help",
    description:
      "A practical, evidence-first process for finding potential B2B buyers through the problems they describe, not just broad contact lists.",
    summary:
      "The fastest way to make prospecting more relevant is to start from a buyer's active problem. Define the problem precisely, learn the language people use, then review the context behind every candidate.",
    sections: [
      {
        title: "Start from a problem, not a giant list",
        paragraphs: [
          "A large contact list can tell you who fits a broad profile, but it rarely tells you who has a reason to care today. Start by defining the change that makes your product relevant: a painful task, a stalled outcome, a new responsibility, or a tool that stopped working.",
          "That choice determines the language you research, the sources you monitor, and the evidence you show a teammate before they reach out.",
        ],
      },
      {
        title: "Use this five-step process",
        steps: [
          {
            title: "Describe the buyer's job",
            description:
              "State the outcome the buyer is trying to achieve and the cost of failing. Avoid describing your own feature set first.",
          },
          {
            title: "Build a phrase bank",
            description:
              "Collect the exact language customers use in calls, reviews, communities, and support conversations. Include frustrations, questions, alternatives, and desired outcomes.",
          },
          {
            title: "Choose sources where the problem appears",
            description:
              "Different buyers ask different places. Select sources because your audience already uses them, not because they return the most posts.",
          },
          {
            title: "Verify the complete context",
            description:
              "Read the full post and nearby discussion. Check whether the issue is current, whether the author fits, and whether you could add genuine value.",
          },
          {
            title: "Create a useful next action",
            description:
              "Save the source link, the buyer's wording, why it matched, and an optional human-written response angle. Do not turn weak candidates into automated outreach.",
          },
        ],
      },
      {
        title: "Common mistakes that create noisy prospect queues",
        bullets: [
          "Using broad product-category keywords without a buyer problem or role filter.",
          "Treating every mention of a topic as a request to buy.",
          "Optimizing for post volume instead of candidates a salesperson would actually review.",
          "Hiding the source evidence so nobody can correct a bad match.",
          "Writing outreach before confirming the candidate has a relevant, current need.",
        ],
      },
    ],
    faqs: [
      {
        question: "Where should a B2B founder look for buyers?",
        answer:
          "Start with places your buyers already use to ask for help or compare options. The right source depends on the audience, so validate it with real customer conversations instead of assuming one channel works for every market.",
      },
      {
        question: "Should I use intent signals instead of a contact database?",
        answer:
          "They solve different problems. Contact data helps identify who to reach; intent helps decide where attention is worth spending first.",
      },
      {
        question: "How many signals are enough?",
        answer:
          "A small number of well-evidenced opportunities is more valuable than a large feed of vague mentions. Measure how often your team accepts a candidate as worth reviewing or contacting.",
      },
    ],
    relatedSlugs: [
      "buyer-intent-signals",
      "buyer-pain-point-research",
      "public-conversation-lead-generation",
    ],
  },
  {
    slug: "public-conversation-lead-generation",
    path: "/resources/public-conversation-lead-generation",
    eyebrow: "Method guide",
    title: "Public Conversation Lead Generation: An Evidence-First Method",
    description:
      "Understand how public-conversation lead generation works, where it is useful, and why every candidate needs source evidence and human review.",
    summary:
      "Public-conversation lead generation looks for openly available discussions that reveal a current problem. Its value is not a scraped list; it is the evidence behind a potential opportunity.",
    sections: [
      {
        title: "What this method is—and is not",
        paragraphs: [
          "This approach begins with public discussions, such as a question, complaint, request for a recommendation, or comparison of options. It uses the language in that discussion to surface a candidate for review.",
          "It is not a reason to collect private messages, build personal profiles, infer sensitive traits, or send automated messages to everyone who mentions a keyword. Public context must remain connected to a specific, relevant use case.",
        ],
      },
      {
        title: "The evidence a useful candidate should include",
        bullets: [
          "A link to the original public source.",
          "The specific sentence or passage that indicates the problem.",
          "A plain-language reason the candidate may fit the product and audience.",
          "A signal-strength assessment that distinguishes clear demand from a weak mention.",
          "A recency check, because an old problem is rarely a current buying opportunity.",
        ],
      },
      {
        title: "How to keep the workflow useful",
        steps: [
          {
            title: "Use buyer language from the website and customers",
            description:
              "Translate your product into the words buyers use when they describe their problem, outcome, or failed workaround.",
          },
          {
            title: "Collect selectively",
            description:
              "Prioritize relevant sources and bounded queries. More sources do not automatically create more qualified opportunities.",
          },
          {
            title: "Rank by evidence",
            description:
              "Prefer a recent, explicit request from a likely fit over a high-volume source with generic discussion.",
          },
          {
            title: "Let a person decide",
            description:
              "A human should confirm the context and choose an appropriate next step. Sometimes the right action is to learn from the conversation and not contact anyone.",
          },
        ],
      },
    ],
    faqs: [
      {
        question: "Does public-conversation lead generation replace sales research?",
        answer:
          "No. It can make research faster by pointing to relevant, recent conversations, but a human still needs to assess fit, context, and the appropriate way to respond.",
      },
      {
        question: "Why do some keyword searches return irrelevant posts?",
        answer:
          "Keywords do not capture intent by themselves. The same phrase can appear in tutorials, jokes, news, competitor conversations, or someone else's problem. Context and verification are essential.",
      },
      {
        question: "What should happen when no good candidates are found?",
        answer:
          "Treat that as a useful result. Revisit the buyer language, source selection, and target market instead of filling the queue with low-quality candidates just to produce volume.",
      },
    ],
    relatedSlugs: [
      "buyer-intent-signals",
      "how-to-find-b2b-buyers",
      "buyer-pain-point-research",
    ],
  },
  {
    slug: "buyer-pain-point-research",
    path: "/resources/buyer-pain-point-research",
    eyebrow: "Research guide",
    title: "Buyer Pain-Point Research for B2B Founders",
    description:
      "A practical guide to researching buyer pain points, turning customer language into useful prospecting criteria, and avoiding generic targeting.",
    summary:
      "Good pain-point research uses evidence from buyers' own language. It helps you understand the situation behind a problem, the failed alternatives, and the outcome a buyer is trying to create.",
    sections: [
      {
        title: "Research the situation, not just the pain word",
        paragraphs: [
          "Words such as 'growth', 'leads', or 'automation' are too broad to guide a useful sales motion. The useful detail is the situation: who is struggling, what they have already tried, what result is missing, and why the issue matters now.",
          "This distinction helps you write better website copy, build stronger search phrases, and decide whether a public conversation is relevant to your offer.",
        ],
      },
      {
        title: "A repeatable pain-point research workflow",
        steps: [
          {
            title: "Collect primary language",
            description:
              "Review customer calls, sales notes, support questions, reviews, lost-deal reasons, and public discussions. Preserve the original wording.",
          },
          {
            title: "Group by recurring situation",
            description:
              "Organize the language around the job the buyer is trying to do, what breaks, what they tried, and the consequence of doing nothing.",
          },
          {
            title: "Write phrase hypotheses",
            description:
              "Create short phrases a buyer might naturally say when looking for help. Keep them concrete and avoid copying internal marketing language.",
          },
          {
            title: "Test against real examples",
            description:
              "Use a small sample of conversations to see whether the phrases surface relevant context. Remove phrases that mostly return education, news, or unrelated discussion.",
          },
          {
            title: "Keep a decision log",
            description:
              "Record why a phrase or source was kept, changed, or rejected. This makes the next round of research faster and more explainable.",
          },
        ],
      },
      {
        title: "Questions that reveal useful buyer language",
        bullets: [
          "What was happening immediately before the buyer started looking for help?",
          "What did they try before they searched for a product or expert?",
          "What words did they use to describe the cost, delay, or risk?",
          "Which alternatives, tools, or workarounds did they mention?",
          "What outcome would make them say the problem was solved?",
        ],
      },
    ],
    faqs: [
      {
        question: "How is pain-point research different from keyword research?",
        answer:
          "Keyword research asks what phrases are searched. Pain-point research asks what situation, frustration, and desired outcome those phrases represent. You need both to build relevant content and prospecting criteria.",
      },
      {
        question: "Can a website provide useful buyer-language clues?",
        answer:
          "Yes. A website explains the offer, audience, use cases, and objections. It should be combined with real customer language before it is used to define a prospecting brief.",
      },
      {
        question: "How often should I update buyer language?",
        answer:
          "Review it whenever your product, market, or ideal customer changes, and after enough candidate feedback reveals new language or repeated false matches.",
      },
    ],
    relatedSlugs: [
      "buyer-intent-signals",
      "how-to-find-b2b-buyers",
      "public-conversation-lead-generation",
    ],
  },
];

export function resourceBySlug(slug: string): ResourceGuide | undefined {
  return resourceGuides.find((guide) => guide.slug === slug);
}
