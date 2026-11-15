import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, ArrowRight, CheckCircle2, Sparkles, Search, Trash2 } from 'lucide-react';
import type { RCTest, RCAttempt } from '../types';
import { getAllLibraryTests } from '../lib/testStore';
import { getCustomTests, deleteCustomTest, getAttempts } from '../lib/storage';

const TOPICS = [
  'All',
  'Philosophy',
  'Economics & Social Theory',
  'Science & Evolution',
  'History & Culture',
  'Technology & AI',
  'Literature & Aesthetics'
];

export default function LibraryPage() {
  const [searchParams] = useSearchParams();

  const [tests, setTests] = useState<RCTest[]>([]);
  const [attempts, setAttempts] = useState<RCAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [topicFilter, setTopicFilter] = useState(searchParams.get('topic') || 'All');
  const [examFilter, setExamFilter] = useState<'All' | 'CAT' | 'GMAT'>('All');
  const [sourceTab, setSourceTab] = useState<'all' | 'library' | 'custom'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'untaken' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLibrary = () => {
    setLoading(true);
    try {
      const lib = getAllLibraryTests();
      const custom = getCustomTests();
      setTests([...lib, ...custom]);
      setAttempts(getAttempts());
    } catch (err) {
      console.error('Library fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const bestScoreByTest = useMemo(() => {
    const map = new Map<string | number, { score: number; max: number }>();
    for (const att of attempts) {
      const prev = map.get(att.test_id);
      if (!prev || att.score > prev.score) {
        map.set(att.test_id, { score: att.score, max: att.max_score });
      }
    }
    return map;
  }, [attempts]);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      if (sourceTab !== 'all' && t.category !== sourceTab) return false;
      if (topicFilter !== 'All' && t.topic !== topicFilter) return false;
      if (examFilter !== 'All' && t.exam_type !== examFilter) return false;
      const taken = bestScoreByTest.has(t.id);
      if (statusFilter === 'untaken' && taken) return false;
      if (statusFilter === 'completed' && !taken) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = t.title.toLowerCase().includes(q);
        const inTopic = t.topic.toLowerCase().includes(q);
        if (!inTitle && !inTopic) return false;
      }
      return true;
    });
  }, [tests, sourceTab, topicFilter, examFilter, statusFilter, searchQuery, bestScoreByTest]);

  const completedCount = tests.filter((t) => bestScoreByTest.has(t.id)).length;
  const completionPct = tests.length > 0 ? Math.round((completedCount / tests.length) * 100) : 0;

  const handleDeleteCustom = (testId: string | number) => {
    try {
      deleteCustomTest(testId);
      fetchLibrary();
    } catch (err) {
      console.error('Delete test error:', err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2.5"
            style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            Curated &amp; Generated Sets
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            Article Library
          </h1>
          <p className="text-sm sm:text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Dense argumentative essays across philosophy, economics, science, and aesthetics—ready for timed CAT &amp; GMAT practice.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold rc-btn-primary self-start md:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>Generate from Custom Essay</span>
        </Link>
      </div>

      {/* Progress Strip */}
      <div className="rc-card p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span style={{ color: 'var(--color-ink)' }}>
              Library Mastery: {completedCount} of {tests.length} passages completed
            </span>
            <span style={{ color: 'var(--color-primary)' }}>{completionPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%`, backgroundColor: 'var(--color-primary)' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(['all', 'untaken', 'completed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize cursor-pointer ${
                statusFilter === st ? 'rc-chip-active' : 'rc-chip'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="space-y-3 mb-7">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All Sets' },
              { id: 'library', label: 'Editorial Library' },
              { id: 'custom', label: 'My Generated Tests' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceTab(tab.id as 'all' | 'library' | 'custom')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  sourceTab === tab.id ? 'rc-chip-active' : 'rc-chip'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--color-border)' }} />

            {(['All', 'CAT', 'GMAT'] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setExamFilter(ex)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  examFilter === ex ? 'rc-chip-active' : 'rc-chip'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="relative sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-soft)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search passage or topic…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs border outline-none"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)'
              }}
            />
          </div>
        </div>

        {/* Topic Chips */}
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setTopicFilter(topic)}
              className={`px-3 py-1.5 rounded-full text-xs cursor-pointer ${
                topicFilter === topic ? 'rc-chip-active' : 'rc-chip'
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Loading passages from library…
        </div>
      ) : filteredTests.length === 0 ? (
        <div className="rc-card p-12 text-center">
          <BookOpen className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-text-soft)' }} />
          <h2 className="font-display text-xl font-semibold mb-1" style={{ color: 'var(--color-ink)' }}>
            No matching RC passages
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Try clearing a filter or paste your own article to synthesize a fresh test.
          </p>
          <Link to="/" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs rc-btn-primary">
            Generate Custom RC Test →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTests.map((test) => {
            const best = bestScoreByTest.get(test.id);
            return (
              <article
                key={test.id}
                className="rc-card p-5 flex flex-col justify-between gap-4 transition-all hover:border-[var(--color-primary)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                      {test.topic}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {best && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            backgroundColor: 'var(--color-correct-soft)',
                            color: 'var(--color-correct)'
                          }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {best.score}/{best.max}
                        </span>
                      )}
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--color-surface-2)',
                          color: 'var(--color-text-muted)'
                        }}
                      >
                        {test.exam_type}
                      </span>
                    </div>
                  </div>

                  <h2 className="font-display text-lg font-semibold leading-snug mb-2" style={{ color: 'var(--color-ink)' }}>
                    {test.title}
                  </h2>

                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--color-text-muted)' }}>
                    {test.passage_paragraphs?.[0]}
                  </p>
                </div>

                <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-soft)' }}>
                    {test.word_count}w · {test.questions?.length || 4} Qs · {test.difficulty}
                  </span>

                  <div className="flex items-center gap-2">
                    {test.category === 'custom' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(test.id)}
                        className="p-1.5 rounded-lg hover:opacity-80 cursor-pointer"
                        style={{ color: 'var(--color-text-soft)' }}
                        title="Delete custom test"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Link
                      to={`/test/${test.id}`}
                      className="inline-flex items-center gap-1 font-semibold px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'var(--color-primary-soft)',
                        color: 'var(--color-primary)'
                      }}
                    >
                      <span>{best ? 'Practice Again' : 'Take Test'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
