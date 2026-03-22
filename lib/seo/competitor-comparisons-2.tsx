// lib/seo/competitor-comparisons-2.tsx
import React from 'react';
import { Target, Hexagon } from 'lucide-react';

/**
 * SEOPageData Interface
 * Upgraded to the "Enterprise Evaluation Matrix" schema.
 * Focuses on respectful, objective comparisons for executive buyers (CIO, CDO, VP of RevOps).
 * Replaces generic "Features/Steps" with deep ROI metrics, Synergy scenarios, 
 * and side-by-side Architectural Evaluations.
 */
export type SEOPageData = {
  type: 'comparison';
  title: string;
  description: string;
  metaKeywords: string[];
  h1: string;
  subtitle: string;
  icon: React.ReactElement;
  corePhilosophy: {
    competitorFocus: string;
    arcliEvolution: string;
    theBottomLine: string;
  };
  evaluationMatrix: {
    category: string;
    competitorApproach: string;
    arcliAdvantage: string;
    businessImpact: string;
  }[];
  synergyScenario: {
    headline: string;
    howTheyWorkTogether: string;
    workflow: string[];
  };
  roiAnalysis: {
    metric: string;
    competitorAverage: string;
    arcliAverage: string;
    financialValue: string;
  }[];
  executiveScenarios: {
    complexity: 'Basic' | 'Advanced' | 'Strategic';
    businessQuestion: string;
    competitorFriction: string;
    arcliResolution: string;
    sqlGenerated?: string;
  }[];
  faqs: { q: string; a: string }[];
  relatedSlugs: string[];
};

export const competitorComparisonsPart2: Record<string, SEOPageData> = {
  'looker-vs-ai-analytics': {
    type: 'comparison',
    title: 'Looker vs AI Analytics: Semantic Agility | Arcli',
    description: 'Compare Looker\'s centralized LookML modeling with Arcli\'s dynamic, context-aware RAG layer. Find the optimal balance of enterprise governance and ad-hoc speed.',
    metaKeywords: ['Looker Alternative', 'LookML vs SQL', 'Looker vs Arcli', 'Enterprise Semantic Layer', 'AI Data Modeling'],
    h1: 'Enterprise Governance vs. Semantic Agility',
    subtitle: 'Looker enforces strict, centralized data definitions via LookML. Arcli introduces dynamic, Context-Aware RAG, allowing teams to explore new data instantly without months of upfront modeling.',
    icon: <Target className="w-12 h-12 text-purple-600 mb-6" />,
    corePhilosophy: {
      competitorFocus: 'Looker (Google Cloud) is the gold standard for absolute data governance. It forces companies to define every metric in LookML upfront, ensuring "one single source of truth" at the cost of agility.',
      arcliEvolution: 'Arcli believes in "Governed Agility." You can explicitly define your core KPIs in Arcli, but our AI dynamically maps the rest of your schema on the fly, allowing instant exploration of un-modeled tables.',
      theBottomLine: 'If you have a massive data engineering team and a 12-month timeline to model your entire warehouse, use Looker. If you need insights today and the flexibility to adapt tomorrow, use Arcli.'
    },
    evaluationMatrix: [
      {
        category: 'Deployment Velocity',
        competitorApproach: 'Requires hiring specialized LookML developers. Implementation cycles often take 3 to 6 months before the first dashboard is usable.',
        arcliAdvantage: 'Connects to your warehouse and dynamically indexes metadata via Vector search in minutes. Usable on Day 1.',
        businessImpact: 'Immediate ROI. Extracting insights from your data warehouse during the trial period, rather than halfway through the fiscal year.'
      },
      {
        category: 'Ad-Hoc Exploration',
        competitorApproach: 'Business users can only explore data within pre-defined "Explores." If a table isn\'t modeled in LookML, it cannot be queried by the business user.',
        arcliAdvantage: 'The AI acts as an infinitely flexible "Explore." You can ask it to join a brand new staging table with production data instantly.',
        businessImpact: 'Unblocks agile analysis, particularly for Product and Marketing teams testing new features or campaigns.'
      },
      {
        category: 'Proprietary Lock-in',
        competitorApproach: 'LookML is proprietary. If you leave Looker, you lose your entire semantic layer and must rebuild from scratch.',
        arcliAdvantage: 'Arcli writes standard SQL and integrates cleanly with open-source tools like dbt. No proprietary lock-in.',
        businessImpact: 'Future-proofs your data stack, ensuring your business logic remains portable and owned by you.'
      }
    ],
    synergyScenario: {
      headline: 'Chatting with your LookML',
      howTheyWorkTogether: 'You don\'t have to abandon your Looker investment. Arcli can act as the conversational layer on top of your governed models.',
      workflow: [
        'Maintain your rigid LookML or dbt definitions for absolute financial accuracy.',
        'Arcli ingests your `schema.yml` files, adopting your exact business definitions.',
        'Non-technical executives use Arcli to ask conversational questions, and the AI routes the query perfectly through your pre-approved semantic models.'
      ]
    },
    roiAnalysis: [
      {
        metric: 'Time to Initial Deployment',
        competitorAverage: '3-6 Months',
        arcliAverage: '1-2 Days',
        financialValue: 'Avoids hundreds of thousands of dollars in implementation consulting fees.'
      },
      {
        metric: 'Data Agility',
        competitorAverage: 'Rigid (Requires code commit)',
        arcliAverage: 'Fluid (Dynamic RAG)',
        financialValue: 'Allows RevOps to merge CRM data with new billing data instantly for margin analysis.'
      }
    ],
    executiveScenarios: [
      {
        complexity: 'Advanced',
        businessQuestion: 'Join the new Zendesk support tickets table with our core Users table to find accounts with high churn risk.',
        competitorFriction: 'A LookML developer must create a new view for the Zendesk table, define the join keys in an Explore, commit to Git, and push to production before the operator can view it.',
        arcliResolution: 'The user simply asks the question. Arcli\'s semantic router identifies the `user_id` foreign key overlap and generates the cross-table join natively in seconds.'
      }
    ],
    faqs: [
      { q: 'Does Arcli offer any metric governance?', a: 'Yes. Our Semantic Governance layer allows you to strictly define core metrics (e.g., "Qualified Lead") once. The AI is structurally mandated to route requests through these definitions to ensure consistency.' },
      { q: 'Does Arcli integrate with dbt?', a: 'Yes. We seamlessly read your dbt `schema.yml` files, utilizing the existing descriptions, models, and relationships curated by your data engineering team to perfectly guide our AI.' }
    ],
    relatedSlugs: ['tableau-vs-ai-analytics', 'hex-vs-ai-analytics']
  },

  'hex-vs-ai-analytics': {
    type: 'comparison',
    title: 'Hex vs AI Analytics: Notebooks vs Chat | Arcli',
    description: 'Compare Hex Technologies with Arcli Analytics. Understand the difference between Python-first notebook environments and zero-code conversational BI for operators.',
    metaKeywords: ['Hex Alternative', 'Hex vs Arcli', 'Data Notebook vs Chat', 'Zero Code Analytics', 'Conversational BI'],
    h1: 'Data Scientists vs. Business Operators',
    subtitle: 'Hex provides an exceptional collaborative environment for Python-native Data Scientists. Arcli is built exclusively for the Business Operator who needs instant answers without ever looking at code.',
    icon: <Hexagon className="w-12 h-12 text-purple-500 mb-6" />,
    corePhilosophy: {
      competitorFocus: 'Hex operates as a highly collaborative Python/SQL Notebook environment (similar to Jupyter). It is deeply targeted at technical personas: Data Scientists, Analytics Engineers, and Quants who need to write complex cell-based code.',
      arcliEvolution: 'Arcli abstracts the computational complexity entirely. Under the hood, we run high-performance vectorized compute, but the user interacts via a simple chat interface. It is a zero-code environment.',
      theBottomLine: 'If your primary goal is to empower a team of Python developers to build complex ML models, use Hex. If your goal is to empower your Sales, Marketing, and Operations leaders to get their own data, use Arcli.'
    },
    evaluationMatrix: [
      {
        category: 'User Experience',
        competitorApproach: 'Requires writing code in sequential cells, managing state, and then manually compiling those cells into a front-end "App" for stakeholders to consume.',
        arcliAdvantage: 'Users ask questions in plain English. The AI generates the query, executes the compute, and automatically renders the optimal visual chart instantly.',
        businessImpact: 'Dramatically expands the total addressable market of users within your company who can actually author insights.'
      },
      {
        category: 'Technical Barrier to Entry',
        competitorApproach: 'High. To author effectively, users must have a firm grasp of SQL, Python (Pandas), and notebook state management.',
        arcliAdvantage: 'Zero. If a user understands their business metrics and can type a sentence, they can generate board-ready analytics.',
        businessImpact: 'Eliminates the need to hire specialized Data Analysts simply to fulfill basic reporting requests.'
      },
      {
        category: 'Dashboard Creation',
        competitorApproach: 'Requires a deliberate, multi-step transition from the notebook logic layer to the App UI layout layer.',
        arcliAdvantage: 'Conversational insights can be pinned directly to traditional, live-updating dashboard layouts with a single click.',
        businessImpact: 'Compresses the workflow from "exploration" to "presentation" into seconds.'
      }
    ],
    synergyScenario: {
      headline: 'The Technical vs. Non-Technical Workflow',
      howTheyWorkTogether: 'Hex and Arcli serve fundamentally different, yet complementary, personas within a modern enterprise.',
      workflow: [
        'Data Scientists use Hex to develop complex predictive models, churn algorithms, and machine learning pipelines.',
        'The output of those models is written back to the Snowflake or Postgres data warehouse.',
        'Business Operators (RevOps, Marketing) use Arcli to conversationally query and chart those predictions in their daily workflow, without needing to open a Python notebook.'
      ]
    },
    roiAnalysis: [
      {
        metric: 'Operator Adoption Rate',
        competitorAverage: 'Low (Intimidating UI)',
        arcliAverage: 'High (Familiar Chat UI)',
        financialValue: 'Maximizes the ROI of your cloud data warehouse by ensuring non-technical teams actually utilize the data.'
      },
      {
        metric: 'App Building Friction',
        competitorAverage: 'Moderate (Cell mapping)',
        arcliAverage: 'Zero (1-Click Pin)',
        financialValue: 'Speeds up operational reporting cycles prior to executive syncs.'
      }
    ],
    executiveScenarios: [
      {
        complexity: 'Strategic',
        businessQuestion: 'Show me the 30-day moving average of our daily active users.',
        competitorFriction: 'An analyst must write a SQL cell to extract the data, pass the dataframe to a Python cell, import Pandas, use `.rolling(window=30).mean()`, and then configure a charting library cell.',
        arcliResolution: 'The user types the question. Arcli automatically generates the underlying SQL Window Function, pushes it to the database, and renders a clean time-series line chart automatically.'
      }
    ],
    faqs: [
      { q: 'Do you support Python execution like Hex?', a: 'Arcli\'s backend utilizes high-performance code for internal vectorized compute, but the platform is strictly a zero-code environment for the user. You do not need to write (or even see) Python to use Arcli.' },
      { q: 'Can I export data to a notebook later?', a: 'Absolutely. You can explore data conversationally in Arcli and export the clean, aggregated results as a highly optimized Parquet or CSV file for deeper, bespoke modeling in Hex or Jupyter.' }
    ],
    relatedSlugs: ['looker-vs-ai-analytics', 'tableau-vs-ai-analytics']
  }
};