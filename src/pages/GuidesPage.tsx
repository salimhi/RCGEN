import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';
import type { RCGuide, GuideContentBlock } from '../types';
import guidesData from '../data/guides.json';

export default function GuidesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const guides = useMemo(() => (guidesData as unknown as RCGuide[]).filter((g) => g.category === 'guide' || g.category === 'blog'), []);

  const activeSlug = searchParams.get('slug') || '';
  const selectedGuide = guides.find((g) => g.slug === activeSlug) || guides[0] || null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="mb-8">
        <span
          className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2.5"
          style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
        >
          PracticeRC Playbooks
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold" style={{ color: 'var(--color-ink)' }}>
          CAT VARC &amp; GMAT Verbal Strategy Guides
        </h1>
        <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Field-tested frameworks for active argument mapping, distractor elimination, and exam-day pacing.
        </p>
      </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* Sidebar List */}
          <aside className="lg:col-span-4 space-y-2.5">
            {guides.map((g) => {
              const isSelected = selectedGuide?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSearchParams({ slug: g.slug })}
                  className="w-full text-left p-4 rounded-2xl border transition-all cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-surface)' : 'transparent',
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    boxShadow: isSelected ? 'var(--shadow-soft)' : 'none'
                  }}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1">
                    <span style={{ color: 'var(--color-primary)' }}>{g.eyebrow}</span>
                    <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-text-soft)' }}>
                      <Clock className="w-3 h-3" />
                      {g.read_minutes}m
                    </span>
                  </div>
                  <h2 className="font-display font-semibold text-base" style={{ color: 'var(--color-ink)' }}>
                    {g.title}
                  </h2>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                    {g.summary}
                  </p>
                </button>
              );
            })}
          </aside>

          {/* Editorial Reader */}
          {selectedGuide && Array.isArray(selectedGuide.content_blocks) && (
            <article className="lg:col-span-8 rc-card-elevated p-5 sm:p-10 space-y-7">
              <div className="pb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-primary)' }}>
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{selectedGuide.eyebrow}</span>
                  <span>·</span>
                  <span>{selectedGuide.read_minutes} min read</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight mb-3" style={{ color: 'var(--color-ink)' }}>
                  {selectedGuide.title}
                </h2>
                <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedGuide.summary}
                </p>
              </div>

              <div className="space-y-7">
                {(selectedGuide.content_blocks as GuideContentBlock[]).map((block, idx) => (
                  <section key={idx} className="space-y-3">
                    <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                      {block.heading}
                    </h3>
                    <p className="text-sm sm:text-base leading-relaxed" style={{ color: 'var(--color-text)' }}>
                      {block.body}
                    </p>
                    {block.bullets && (
                      <ul className="space-y-2 pl-4 pt-1">
                        {block.bullets.map((b, bIdx) => (
                          <li key={bIdx} className="text-sm leading-relaxed list-disc" style={{ color: 'var(--color-text-muted)' }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {block.callout && (
                      <div
                        className="p-4 rounded-xl border-l-4 text-sm"
                        style={{
                          backgroundColor: 'var(--color-surface-2)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-ink)'
                        }}
                      >
                        {block.callout}
                      </div>
                    )}
                  </section>
                ))}
              </div>

              <div className="pt-6 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>
                    Put this framework to work immediately
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Take a fresh timed passage and test per-option elimination.
                  </p>
                </div>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold rc-btn-primary shrink-0"
                >
                  <span>Open RC Generator</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </article>
          )}
        </div>
    </div>
  );
}
