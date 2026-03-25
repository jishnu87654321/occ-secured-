"use client";

import { Zap, Users, TrendingUp } from "lucide-react";
import Link from "next/link";
import InteractiveGrid from "@/components/InteractiveGrid";
import EnhancedHero from "@/components/EnhancedHero";
import { memo, useEffect, useState } from "react";
import { type Post } from "@/lib/dataProvider";
import { listFeedFromApi } from "@/lib/postApi";
import SiteContainer from "@/components/SiteContainer";

const HomeFeedPreviewCard = memo(function HomeFeedPreviewCard({ post }: { post: Post }) {
  return (
    <article className="border-4 border-black bg-white p-8 shadow-[8px_8px_0_0_#000]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-block border-2 border-black bg-black px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
            {post.clubName}
          </span>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
            {post.author} • {post.timestamp}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
          <span>{post.likes} likes</span>
          <span>{post.commentsCount ?? 0} comments</span>
        </div>
      </div>

      <p className="mt-5 line-clamp-4 border-l-4 border-brutal-blue pl-4 text-xl font-black uppercase leading-tight text-black">
        {post.content}
      </p>

      <div className="mt-6">
        <Link
          href="/feeds"
          className="inline-flex border-2 border-black bg-white px-4 py-3 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
        >
          Open Full Feed
        </Link>
      </div>
    </article>
  );
});

export default function Home() {
  const [featuredPosts, setFeaturedPosts] = useState<Post[]>([]);

  useEffect(() => {
    let isActive = true;

    const loadFeaturedPosts = async () => {
      try {
        const feed = await listFeedFromApi(1, 2);
        if (!isActive) return;
        setFeaturedPosts(feed.items);
      } catch {
        if (!isActive) return;
        setFeaturedPosts([]);
      }
    };

    loadFeaturedPosts();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="flex flex-col items-center bg-brutal-gray min-h-screen relative">
      <InteractiveGrid />
      <EnhancedHero />

      {/* Feeds Preview */}
      <SiteContainer as="section" className="relative py-20">
        <div className="mx-auto max-w-4xl">
          <div
            className="mb-12 flex flex-col items-start gap-4 border-b-8 border-black pb-6 animate-slideUp md:flex-row md:items-end md:justify-between"
            style={{ animationDelay: "120ms", animationFillMode: "both" }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-brutal-blue font-black uppercase">
                  <TrendingUp className="w-6 h-6" /> Trending Now
              </div>
              <h2 className="text-5xl md:text-6xl font-black uppercase tracking-tighter text-black">Feeds</h2>
            </div>
            <Link href="/feeds" className="bg-white text-black border-4 border-black px-6 py-3 font-black uppercase hover:bg-black hover:text-white transition-all shadow-[4px_4px_0_0_#000] hover:shadow-none">View Full Feeds</Link>
          </div>
          
          <div className="space-y-12">
            {featuredPosts.length > 0 ? (
              featuredPosts.map((post, index) => (
                <div
                  key={post.id}
                  className="animate-fadeIn"
                  style={{ animationDelay: `${180 + index * 90}ms`, animationFillMode: "both" }}
                >
                  <HomeFeedPreviewCard post={post} />
                </div>
              ))
            ) : (
              <div
                className="bg-white border-4 border-black p-10 shadow-[8px_8px_0_0_#000] animate-fadeIn"
                style={{ animationDelay: "200ms", animationFillMode: "both" }}
              >
                <h3 className="text-3xl font-black uppercase tracking-tighter text-black">Feeds</h3>
                <p className="mt-3 font-bold text-black/70">
                  Club posts, announcements, and updates will land here as the OCC network gets moving.
                </p>
              </div>
            )}
          </div>

          <div
            className="mt-16 text-center animate-fadeIn"
            style={{ animationDelay: "320ms", animationFillMode: "both" }}
          >
              <Link href="/feeds" className="inline-block text-2xl font-black uppercase border-b-4 border-black hover:text-brutal-blue transition-all cursor-pointer">
                  Discover more activity &rarr;
              </Link>
          </div>
        </div>
      </SiteContainer>
      
      {/* Visual Break / Features */}
      <section className="w-full bg-brutal-blue py-24 mb-24 border-y-8 border-black relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(to_bottom,white,transparent)]"></div>
        <SiteContainer className="relative z-10 grid grid-cols-1 gap-12 md:grid-cols-3">
            {[
                { title: "Cross-Campus", icon: <Users className="w-12 h-12" />, desc: "Connect with students from any university in the world." },
                { title: "Active Clubs", icon: <TrendingUp className="w-12 h-12" />, desc: "Find your niche or build your own club from scratch." },
                { title: "Host Events", icon: <Zap className="w-12 h-12" />, desc: "Organize meetups, workshops, and competitions seamlessly." }
            ].map((feature, idx) => (
                <div
                  key={idx}
                  className="bg-white border-4 border-black p-8 shadow-[8px_8px_0_0_#000] hover:-translate-y-2 transition-all animate-fadeIn"
                  style={{ animationDelay: `${160 + idx * 110}ms`, animationFillMode: "both" }}
                >
                    <div className="mb-6 bg-brutal-gray inline-block p-4 border-2 border-black shadow-[4px_4px_0_0_#000]">{feature.icon}</div>
                    <h3 className="text-3xl font-black uppercase mb-4 text-black">{feature.title}</h3>
                    <p className="font-bold text-lg text-black/80">{feature.desc}</p>
                </div>
            ))}
        </SiteContainer>
      </section>
    </div>
  );
}
