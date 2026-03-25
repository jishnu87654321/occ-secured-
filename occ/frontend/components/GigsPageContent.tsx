"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  GraduationCap,
  Shield,
  ShoppingBag,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { listPublicGigs, type GigSummary } from "@/lib/gigApi";
import SiteContainer from "@/components/SiteContainer";

type OpportunityCardConfig = {
  slug: string;
  title: string;
  category: string;
  description: string;
  highlight: string;
  cta: string;
  Icon: typeof Trophy;
};

const opportunityCatalog: OpportunityCardConfig[] = [
  {
    slug: "competitions",
    title: "COMPETITIONS",
    category: "Competitions",
    description: "Earn prize money through hackathons, pitch competitions, and challenges",
    highlight: "Prize pool opportunities",
    cta: "VIEW OPPORTUNITIES (2)",
    Icon: Trophy,
  },
  {
    slug: "crescentia-private-tuitions",
    title: "CRESCENTIA + PRIVATE TUITIONS",
    category: "Tutoring",
    description: "Monetize your knowledge by tutoring and mentoring students",
    highlight: "Tutoring and mentoring tracks",
    cta: "VIEW OPPORTUNITIES (2)",
    Icon: GraduationCap,
  },
  {
    slug: "hiring",
    title: "HIRING",
    category: "Hiring",
    description: "Earn referral rewards by connecting candidates with companies",
    highlight: "Referral-based opportunities",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: Users,
  },
  {
    slug: "training",
    title: "TRAINING",
    category: "Training",
    description: "Host workshops, bootcamps, and skill development sessions",
    highlight: "Workshop and session-based gigs",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: BookOpen,
  },
  {
    slug: "shop-community",
    title: "SHOP COMMUNITY",
    category: "Commerce",
    description: "Sell products, merchandise, and digital assets to students",
    highlight: "Community commerce opportunities",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: ShoppingBag,
  },
  {
    slug: "ace-it-up",
    title: "ACE IT UP",
    category: "Career Services",
    description: "Offer skill improvement and career development services",
    highlight: "Career growth support gigs",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: Target,
  },
  {
    slug: "etiquette",
    title: "ETIQUETTE",
    category: "Compliance",
    description: "Refer companies for compliance and workplace training programs",
    highlight: "Compliance and training referrals",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: Shield,
  },
  {
    slug: "business-psychology",
    title: "BUSINESS PSYCHOLOGY",
    category: "Business Psychology",
    description: "Teach behavioral economics and marketing psychology concepts",
    highlight: "Applied psychology sessions",
    cta: "VIEW OPPORTUNITIES (1)",
    Icon: Brain,
  },
];

const earningSteps = [
  {
    id: 1,
    title: "CHOOSE YOUR VERTICAL",
    body: "Select from multiple OCC earning categories based on your skills, interests, and the kind of work you want to do.",
  },
  {
    id: 2,
    title: "APPLY OR CREATE",
    body: "Apply to live opportunities and move through approval before protected instructions and deeper workflow details unlock.",
  },
  {
    id: 3,
    title: "GET APPROVED & UNLOCK",
    body: "Once an admin approves your application, the dashboard becomes the main place to track status and open protected gig details.",
  },
];

function GigOpportunityCard({
  card,
  gig,
}: {
  card: OpportunityCardConfig;
  gig?: GigSummary;
}) {
  const Icon = card.Icon;
  const href = gig ? `/gigs/${gig.slug}/apply` : "/register";

  return (
    <article className="relative">
      <div className="absolute inset-x-3 bottom-[-14px] top-3 bg-[#5964ff]/35" aria-hidden="true" />
      <div className="relative border-[5px] border-black bg-white p-6 shadow-[10px_10px_0_0_#000] md:p-9">
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div className="absolute inset-0 translate-x-[6px] translate-y-[6px] border-[5px] border-black bg-black" aria-hidden="true" />
            <div className="relative flex h-20 w-20 items-center justify-center border-[5px] border-black bg-brutal-blue text-white">
              <Icon className="h-9 w-9" strokeWidth={2.4} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-tighter md:text-[2.2rem]">
              {card.title}
            </h2>
            <p className="mt-5 max-w-2xl text-xl font-bold leading-snug text-slate-700">{card.description}</p>
            <p className="mt-6 text-lg font-black text-brutal-blue md:text-2xl">{card.highlight}</p>
          </div>
        </div>

        <div className="mt-10">
          <Link
            href={href}
            className="relative inline-flex w-full items-center justify-center border-[5px] border-black bg-black px-6 py-4 text-lg font-black uppercase text-white transition-transform hover:translate-x-1 hover:translate-y-1 md:text-2xl"
          >
            <span className="absolute inset-0 translate-x-[8px] translate-y-[8px] bg-brutal-blue" aria-hidden="true" />
            <span className="relative z-10">{card.cta}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function HowEarningWorksSection() {
  return (
    <section className="relative mt-20">
      <div className="absolute inset-x-4 bottom-[-14px] top-4 bg-[#5964ff]/28" aria-hidden="true" />
      <div className="relative border-[5px] border-black bg-white px-6 py-8 shadow-[10px_10px_0_0_#000] md:px-10 md:py-12">
        <h2 className="text-4xl font-black uppercase tracking-tighter md:text-6xl">HOW EARNING WORKS</h2>
        <div className="mt-6 h-[5px] w-full bg-black" />

        <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {earningSteps.map((step) => (
            <div key={step.id} className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-black bg-brutal-blue text-4xl font-black text-white shadow-[6px_6px_0_0_#000]">
                {step.id}
              </div>
              <h3 className="mt-7 text-3xl font-black uppercase leading-none tracking-tighter">{step.title}</h3>
              <p className="mx-auto mt-5 max-w-sm text-xl font-bold leading-snug text-slate-700">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function GigsPageContent() {
  const [gigs, setGigs] = useState<GigSummary[]>([]);

  useEffect(() => {
    let active = true;

    listPublicGigs()
      .then((items) => {
        if (!active) return;
        setGigs(items);
      });

    return () => {
      active = false;
    };
  }, []);

  const gigsBySlug = useMemo(() => {
    const map = new Map<string, GigSummary>();
    for (const gig of gigs) {
      map.set(gig.slug.trim().toLowerCase(), gig);
    }
    return map;
  }, [gigs]);

  return (
    <div className="min-h-screen bg-brutal-gray py-10 md:py-16">
      <SiteContainer>
        <section className="mb-12 max-w-5xl">
          <p className="font-black uppercase tracking-[0.26em] text-brutal-blue">Public Discovery</p>
          <h1 className="mt-4 text-5xl font-black uppercase leading-[0.82] tracking-tighter md:text-7xl">
            OCC Gigs
          </h1>
          <p className="mt-6 max-w-4xl text-xl font-bold leading-relaxed text-slate-700 md:text-2xl">
            Explore the full OCC gig verticals in the same editorial layout. Public cards stay safe and high-level while protected gig details still unlock only after approval.
          </p>
        </section>

        <div className="grid gap-10 xl:grid-cols-2">
          {opportunityCatalog.map((card) => (
            <GigOpportunityCard
              key={card.slug}
              card={card}
              gig={gigsBySlug.get(card.slug)}
            />
          ))}
        </div>

        <HowEarningWorksSection />

        <section className="mt-14 flex flex-wrap items-center gap-4">
          <Link
            href="/dashboard"
            className="relative inline-flex items-center justify-center border-[5px] border-black bg-black px-7 py-4 text-lg font-black uppercase text-white transition-transform hover:translate-x-1 hover:translate-y-1"
          >
            <span className="absolute inset-0 translate-x-[8px] translate-y-[8px] bg-brutal-blue" aria-hidden="true" />
            <span className="relative z-10">Open Dashboard</span>
          </Link>
          <Link
            href="/feeds"
            className="border-[5px] border-black bg-white px-7 py-4 text-lg font-black uppercase text-black shadow-[8px_8px_0_0_#000] transition-transform hover:translate-x-1 hover:translate-y-1"
          >
            See OCC Activity
          </Link>
        </section>
      </SiteContainer>
    </div>
  );
}
