import fs from 'fs';
import path from 'path';
import { getSupabase } from './db-client.js';

// Determine Data Mode at startup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const hasRealSupabase = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('placeholder')
);

export const DATA_MODE = hasRealSupabase
  ? 'supabase'
  : (process.env.VERCEL ? 'supabase' : 'local');

// Initial seed data for local mode
const SEED_TESTS = [
  {
    id: 1,
    slug: 'the-attention-economy-cat-sample',
    title: 'The Attention Economy and Cognitive Commons',
    topic: 'Technology & AI',
    source_label: 'PracticeRC Editorial',
    category: 'library',
    exam_type: 'CAT',
    difficulty: 'Challenging',
    word_count: 512,
    target_seconds: 480,
    is_live_featured: true,
    generation_source: null,
    generation_reason: null,
    passage_paragraphs: [
      'Discussions of modern digital technology routinely begin from a reassuringly linear premise: that expanding access to networked information democratizes knowledge and levels epistemic playing fields. Across much of contemporary platform design, that expectation has functioned less as an empirical finding than as an organizing faith. To a point, the faith is understandable. Networked repositories do eliminate physical barriers to information, and no serious educator proposes a return to pre-digital gatekeeping. What the linear view obscures, however, is that expanding the sheer volume of stimuli frequently degrades the cognitive conditions required to evaluate it.',
      'This divergence is not an accidental byproduct of user indiscipline; it follows from the commercial architecture of attention extraction itself. Whenever platform profitability depends on engagement metrics rather than conceptual understanding, algorithms inevitably optimize for reflexive emotional capture rather than deliberative scrutiny. Analysts who evaluate platform health purely by operational activity treat as vibrant civic discourse what is, in truth, manufactured volatility. Were the problem merely lack of digital literacy, instructional modules would resolve it. Because the tension concerns how platform architectures systematically penalize quiet reflection, additional screen time often deepens cognitive fragmentation instead of correcting it.',
      'Historical parallels illuminate the underlying dynamic. Earlier transformations in communication—from the rapid spread of the printing press to the emergence of mass-market tabloids—were accompanied by utopian assurances that cheaper print would depoliticize dispute and enlighten the public. Yet the historical record reveals almost the opposite trajectory: whenever the cost of publishing plummeted without corresponding developments in verification institutions, polarization and sensationalist panic intensified. What altered over time was not the presence of human curiosity, but the institutional incentives under which that curiosity was commodified.',
      'Defenders of engagement-driven ranking reply that algorithmic feeds merely reflect authentic public demand: users get what they click on. That defence carries superficial weight, but it conflates instinctive impulse with reflective preference. What cannot easily be monetized—deep contemplative reading, nuanced synthesis, and second-order doubt—drops out of algorithmic curation, acquiring the false appearance of obsolescence simply because it resists neat monetization.',
      'The deeper lesson regarding the attention economy is therefore neither uncritical technophilia nor fatalistic luddism. Rather, healthy democratic inquiry requires recognizing that attention is an exhaustible ecological commons: whenever platforms enclose that commons for private yield, the resulting cognitive exhaustion threatens the very deliberation upon which self-governing societies depend.'
    ],
    questions: [
      {
        id: 'q1',
        type: 'Main Idea',
        stem: 'Which of the following best states the primary purpose of the passage?',
        correctLetter: 'B',
        options: [
          {
            letter: 'A',
            text: 'To catalogue recent empirical breakthroughs in platform design and show that print institutions are wholly obsolete.',
            flawTag: 'Too Extreme',
            explanation: 'Wrong — The passage explicitly cautions against treating prior frameworks as obsolete, focusing instead on structural limits.'
          },
          {
            letter: 'B',
            text: 'To challenge an overly simplified view of digital democratization by explaining how commercial attention extraction degrades cognitive evaluation.',
            flawTag: 'Correct Key',
            explanation: 'Correct — Captures the full arc of the passage from critique of the linear premise to the underlying structural mechanism.'
          },
          {
            letter: 'C',
            text: 'To prove that information overload stems primarily from individual cognitive weakness rather than institutional designs.',
            flawTag: 'Reversal',
            explanation: 'Wrong — Reverses the author\'s argument; the author emphasizes structural platform architecture over individual fault.'
          },
          {
            letter: 'D',
            text: 'To advocate abandoning digital communication entirely in favour of pre-modern oral traditions.',
            flawTag: 'Overshoots Claim',
            explanation: 'Wrong — Rejects extreme fatalism and luddism in Paragraph 5.'
          }
        ]
      },
      {
        id: 'q2',
        type: 'Inference',
        stem: 'Based on the passage, which of the following can most reasonably be inferred regarding digital platform metrics?',
        correctLetter: 'C',
        options: [
          {
            letter: 'A',
            text: 'Platform engineers have deliberately sabotaged user literacy to prevent regulation.',
            flawTag: 'Unsupported Motive',
            explanation: 'Wrong — Attributes deliberate sabotage rather than systemic economic incentives.'
          },
          {
            letter: 'B',
            text: 'High engagement statistics automatically indicate healthy intellectual discourse.',
            flawTag: 'Contradicts Text',
            explanation: 'Wrong — Directly contradicts Paragraph 2, which argues engagement metrics optimize for emotional capture.'
          },
          {
            letter: 'C',
            text: 'A platform can report robust operational engagement while actively eroding deep conceptual reflection.',
            flawTag: 'Correct Key',
            explanation: 'Correct — Follows directly from the author\'s analysis in Paragraph 2 and Paragraph 4.'
          },
          {
            letter: 'D',
            text: 'No historical medium prior to the internet ever commodified human curiosity.',
            flawTag: 'Absolute Quantifier',
            explanation: 'Wrong — Fails on the absolute quantifier "no historical medium"; Paragraph 3 notes print tabloids did the same.'
          }
        ]
      },
      {
        id: 'q3',
        type: 'Paragraph Function',
        stem: 'In the context of the passage as a whole, the paragraph that begins "Historical parallels illuminate the underlying dynamic" primarily serves to:',
        correctLetter: 'A',
        options: [
          {
            letter: 'A',
            text: 'Contextualize the central argument by showing that institutional shifts in media historically produced similar tensions.',
            flawTag: 'Correct Key',
            explanation: 'Correct — Uses the historical emergence of print to demonstrate that commodified media volatility is not a unique modern aberration.'
          },
          {
            letter: 'B',
            text: 'Retract the critique of digital platforms and praise modern algorithms over print media.',
            flawTag: 'Reversal',
            explanation: 'Wrong — The author does not retract the critique; the paragraph reinforces the argument.'
          },
          {
            letter: 'C',
            text: 'Provide an exhaustive statistical record of literacy rates from the Renaissance to the present.',
            flawTag: 'Fabricated Detail',
            explanation: 'Wrong — The paragraph contains no exhaustive statistical tables; it is a conceptual historical parallel.'
          },
          {
            letter: 'D',
            text: 'Summarize personal biographical anecdotes of early newspaper editors.',
            flawTag: 'Misreads Function',
            explanation: 'Wrong — The focus is systemic, not personal gossip or biographical trivia.'
          }
        ]
      },
      {
        id: 'q4',
        type: 'Tone & Attitude',
        stem: 'The author\'s attitude toward engagement-driven ranking models is best described as:',
        correctLetter: 'D',
        options: [
          {
            letter: 'A',
            text: 'Polemical hostility that dismisses all technological progress as moral degeneration.',
            flawTag: 'Wrong Tone',
            explanation: 'Wrong — Too hostile; the author explicitly disavows "fatalistic luddism".'
          },
          {
            letter: 'B',
            text: 'Unqualified endorsement that celebrates market efficiency without reservation.',
            flawTag: 'Wrong Tone',
            explanation: 'Wrong — Directly opposite to the passage\'s critical stance.'
          },
          {
            letter: 'C',
            text: 'Dispassionate neutrality that presents competing arguments without taking a stance.',
            flawTag: 'Understates Stance',
            explanation: 'Wrong — The author clearly argues that attention is an endangered commons.'
          },
          {
            letter: 'D',
            text: 'Measured analytical critique that acknowledges superficial benefits while exposing deeper structural flaws.',
            flawTag: 'Correct Key',
            explanation: 'Correct — Concedes partial utility while thoroughly diagnosing structural risks.'
          }
        ]
      }
    ]
  }
];

const TOPIC_ROTATION = [
  { topic: 'Philosophy', work: 'Epistemic Frameworks & Judgment' },
  { topic: 'Economics & Social Theory', work: 'Market Efficiency & Institutional Design' },
  { topic: 'Science & Evolution', work: 'Evolutionary Biology & Complex Systems' },
  { topic: 'History & Culture', work: 'Historical Archives & Colonial Power' },
  { topic: 'Technology & AI', work: 'Algorithmic Optimization & Agency' },
  { topic: 'Literature & Aesthetics', work: 'Narrative Form & Aesthetic Value' }
];

function generateSeedPyq() {
  const list = [];
  let idCounter = 1;
  for (const year of [2025, 2024, 2023, 2022, 2021]) {
    for (const slot of [1, 2, 3]) {
      for (let pNum = 1; pNum <= 4; pNum++) {
        const item = TOPIC_ROTATION[(year + slot + pNum) % TOPIC_ROTATION.length];
        list.push({
          id: idCounter++,
          year,
          slot,
          passage_num: pNum,
          title: `CAT ${year} Slot ${slot}: ${item.work}`,
          topic: item.topic,
          source_work: item.work,
          question_count: 4,
          linked_test_id: null
        });
      }
    }
  }
  return list;
}

const SEED_GUIDES = [
  {
    id: 1,
    slug: 'active-argument-mapping',
    category: 'guide',
    eyebrow: 'VARC CORE STRATEGY',
    title: 'Active Argument Mapping: Reading for Structure Over Fact',
    summary: 'How 99th-percentile CAT test-takers track thesis pivots and author stance in under 3.5 minutes.',
    read_minutes: 6,
    content_blocks: [
      {
        heading: '1. Why Passive Reading Fails in CAT & GMAT',
        body: 'Most aspirants read RC passages like newspaper articles—hoping that absorbing general meaning will suffice when answering questions. But CAT questions rarely test factual recall; they test structural relationships, unstated assumptions, and rhetorical pivots.',
        bullets: [
          'Track the author\'s voice vs. cited opinions: Does the author endorse the view or merely summarize it?',
          'Highlight discourse pivots immediately: Words like "However", "Yet", and "Obscures" signal where the core thesis lives.'
        ]
      },
      {
        heading: '2. The Two-Pass Reading Routine',
        body: 'Spend 2.5 to 3 minutes on your first pass establishing paragraph functions. Do not memorize details; note where they live so you can verify them when answering specific inference questions.'
      }
    ]
  },
  {
    id: 2,
    slug: 'eliminating-close-distractors',
    category: 'guide',
    eyebrow: 'TRAP OPTION DIAGNOSIS',
    title: 'The Anatomy of CAT Trap Options: How to Eliminate the 50-50 Choice',
    summary: 'A taxonomy of how exam convenors design seductive wrong options that fool over 60% of aspirants.',
    read_minutes: 8,
    content_blocks: [
      {
        heading: 'The 4 Major Trap Archetypes',
        body: 'Exam designers rarely write obviously foolish options. The most dangerous distractors are 80% correct with a fatal flaw hidden in an adverb or causal verb.',
        bullets: [
          'Too Extreme: Uses absolute qualifiers like "wholly", "completely", or "invariably" where the author was guarded.',
          'Causal Reversal: Changes who caused what, or attributes bad faith to a structural blind spot.',
          'Out of Scope: Sounds scholarly and plausible in real life, but has zero textual warrant in this specific passage.'
        ]
      }
    ]
  },
  {
    id: 3,
    slug: 'speed-drill-1',
    category: 'speed_passage',
    eyebrow: 'DIAGNOSTIC BENCHMARK',
    title: 'Scientific Idealization and Boundary Conditions',
    summary: 'A calibrated 160-word passage to benchmark reading speed and comprehension accuracy.',
    read_minutes: 2,
    content_blocks: {
      wordCount: 160,
      paragraphs: [
        'Discussions of complex systems routinely begin from an assumption of equilibrium: that once observers account for primary inputs, systemic outputs will settle into predictable patterns. Across much of modern quantitative modeling, that expectation functions as an organizing faith.',
        'What the equilibrium view obscures, however, is that real-world networks exhibit cascading disruptions when key nodes fail. Expanding measurement accuracy does not eliminate these feedback loops; rather, it reveals how fragile tightly coupled systems truly are.'
      ],
      questions: [
        {
          q: 'What is the primary assumption challenged by the author in the passage?',
          options: [
            'That complex systems naturally converge toward predictable equilibrium.',
            'That quantitative data is useless in all fields.',
            'That modern scientists refuse to use computers.',
            'That measuring networks always prevents disruption.'
          ],
          correctIndex: 0
        },
        {
          q: 'According to the second paragraph, what happens when tightly coupled networks face shocks?',
          options: [
            'They immediately stabilize due to redundant nodes.',
            'Local disruptions can cascade nonlinearly rather than averaging out.',
            'Measurement errors completely disappear.',
            'The system transforms into a linear structure.'
          ],
          correctIndex: 1
        }
      ]
    }
  }
];

class LocalDataStore {
  constructor() {
    this.dir = path.join(process.cwd(), '.data');
    this.file = path.join(this.dir, 'storage.json');
    this.tests = [...SEED_TESTS];
    this.pyq = generateSeedPyq();
    this.guides = [...SEED_GUIDES];
    this.attempts = [];
    this.nextTestId = 100;
    this.nextAttemptId = 1;

    if (!process.env.VERCEL) {
      this.load();
    }
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tests)) this.tests = data.tests;
        if (Array.isArray(data.pyq)) this.pyq = data.pyq;
        if (Array.isArray(data.guides)) this.guides = data.guides;
        if (Array.isArray(data.attempts)) this.attempts = data.attempts;
        if (data.nextTestId) this.nextTestId = data.nextTestId;
        if (data.nextAttemptId) this.nextAttemptId = data.nextAttemptId;
        return;
      }
    } catch (err) {
      console.warn('[LocalDataStore] Could not read .data/storage.json, resetting to seed:', err.message);
    }
    this.save();
  }

  save() {
    if (process.env.VERCEL) return;
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
      }
      fs.writeFileSync(
        this.file,
        JSON.stringify(
          {
            tests: this.tests,
            pyq: this.pyq,
            guides: this.guides,
            attempts: this.attempts,
            nextTestId: this.nextTestId,
            nextAttemptId: this.nextAttemptId
          },
          null,
          2
        ),
        'utf8'
      );
    } catch (err) {
      console.warn('[LocalDataStore] Save failed:', err.message);
    }
  }

  async getTestById(id) {
    this.load();
    return this.tests.find((t) => t.id === Number(id)) || null;
  }

  async getTestBySlug(slug) {
    this.load();
    return this.tests.find((t) => t.slug === slug) || null;
  }

  async listTests(filters = {}) {
    this.load();
    let list = [...this.tests].reverse();
    if (filters.category && filters.category !== 'all') {
      list = list.filter((t) => t.category === filters.category);
    }
    if (filters.topic && filters.topic !== 'All') {
      list = list.filter((t) => t.topic === filters.topic);
    }
    if (filters.exam_type && filters.exam_type !== 'All') {
      list = list.filter((t) => t.exam_type === filters.exam_type);
    }
    return list;
  }

  async createTest(testData) {
    const id = this.nextTestId++;
    const test = {
      id,
      ...testData,
      created_at: testData.created_at || new Date().toISOString()
    };
    this.tests.push(test);
    this.save();
    return test;
  }

  async deleteTest(id, userToken) {
    const numId = Number(id);
    const idx = this.tests.findIndex((t) => t.id === numId);
    if (idx === -1) {
      return { ok: false, status: 404, error: 'Test not found' };
    }

    // In local dev mode only (not Vercel), allow dev bypass with clear log warning
    if (!userToken) {
      console.warn('[DEV BYPASS] Local dev mode allowed test deletion without user auth for test id:', id);
    }

    this.tests.splice(idx, 1);
    this.save();
    return { ok: true, status: 200 };
  }

  async listPyqCatalog(year) {
    let list = this.pyq;
    if (year) list = list.filter((p) => p.year === Number(year));
    return list;
  }

  async getPyqById(id) {
    return this.pyq.find((p) => p.id === Number(id)) || null;
  }

  async updatePyqLinked(pyqId, linkedTestId) {
    const item = this.pyq.find((p) => p.id === Number(pyqId));
    if (item) {
      item.linked_test_id = linkedTestId;
      this.save();
    }
    return item;
  }

  async getLiveArenaData() {
    const activeTest = this.tests.find((t) => t.is_live_featured) || this.tests[0] || null;
    const archiveTests = this.tests.filter((t) => !activeTest || t.id !== activeTest.id);
    const leaderboard = this.attempts
      .filter((a) => activeTest && a.test_id === activeTest.id)
      .sort((a, b) => b.score - a.score || a.time_seconds - b.time_seconds)
      .slice(0, 30);
    return { activeTest, leaderboard, archiveTests };
  }

  async listGuides(category, slug) {
    if (slug) {
      return this.guides.find((g) => g.slug === slug) || null;
    }
    let list = this.guides;
    if (category) {
      list = list.filter((g) => g.category === category);
    }
    return list;
  }

  async listAttempts(filters = {}) {
    let list = [...this.attempts].reverse();
    if (filters.user_id) {
      list = list.filter((a) => a.user_id === filters.user_id);
    }
    if (filters.test_id) {
      list = list.filter((a) => a.test_id === Number(filters.test_id));
    }
    return list;
  }

  async createAttempt(attemptData) {
    const id = this.nextAttemptId++;
    const attempt = {
      id,
      ...attemptData,
      created_at: new Date().toISOString()
    };
    this.attempts.push(attempt);
    this.save();

    const peers = this.attempts
      .filter((a) => a.test_id === attempt.test_id)
      .sort((a, b) => b.score - a.score || a.time_seconds - b.time_seconds);
    const rank = peers.findIndex((a) => a.id === attempt.id) + 1;

    return { attempt, rank, totalPeers: peers.length };
  }
}

class SupabaseDataStore {
  constructor() {
    this.client = getSupabase();
  }

  get clientOrThrow() {
    const c = getSupabase();
    if (!c) throw new Error('Supabase client is not configured.');
    return c;
  }

  async getTestById(id) {
    const { data, error } = await this.clientOrThrow
      .from('rc_tests')
      .select('*')
      .eq('id', Number(id))
      .single();
    if (error) return null;
    return data;
  }

  async getTestBySlug(slug) {
    const { data, error } = await this.clientOrThrow
      .from('rc_tests')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error) return null;
    return data;
  }

  async listTests(filters = {}) {
    let q = this.clientOrThrow.from('rc_tests').select('*').order('id', { ascending: false });
    if (filters.category && filters.category !== 'all') {
      q = q.eq('category', filters.category);
    }
    if (filters.topic && filters.topic !== 'All') {
      q = q.eq('topic', filters.topic);
    }
    if (filters.exam_type && filters.exam_type !== 'All') {
      q = q.eq('exam_type', filters.exam_type);
    }
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return data || [];
  }

  async createTest(testData) {
    const supabase = this.clientOrThrow;

    // Try inserting with generation_source and generation_reason
    let { data, error } = await supabase
      .from('rc_tests')
      .insert(testData)
      .select('*')
      .single();

    // Gracefully handle case where columns generation_source / generation_reason don't exist yet in DB
    if (error && (error.message?.includes('generation_source') || error.message?.includes('generation_reason'))) {
      const { generation_source, generation_reason, ...fallbackData } = testData;
      const retry = await supabase.from('rc_tests').insert(fallbackData).select('*').single();
      if (retry.error) throw retry.error;
      data = {
        ...retry.data,
        generation_source,
        generation_reason
      };
    } else if (error) {
      throw error;
    }

    return data;
  }

  async deleteTest(id, userToken) {
    const supabase = this.clientOrThrow;
    if (!userToken) {
      return { ok: false, status: 401, error: 'Authorization header with Bearer token is required' };
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
    if (authErr || !user) {
      return { ok: false, status: 401, error: 'Invalid or expired authentication token' };
    }

    const { data: test, error: fetchErr } = await supabase
      .from('rc_tests')
      .select('created_by, category')
      .eq('id', Number(id))
      .single();

    if (fetchErr || !test) {
      return { ok: false, status: 404, error: 'Test not found' };
    }

    if (test.created_by !== user.id || test.category !== 'custom') {
      return { ok: false, status: 403, error: 'Forbidden: you can only delete your own custom tests' };
    }

    const { error: delErr } = await supabase.from('rc_tests').delete().eq('id', Number(id));
    if (delErr) throw delErr;

    return { ok: true, status: 200 };
  }

  async listPyqCatalog(year) {
    let q = this.clientOrThrow
      .from('rc_pyq_catalog')
      .select('*')
      .order('year', { ascending: false })
      .order('slot', { ascending: true })
      .order('passage_num', { ascending: true });

    if (year) q = q.eq('year', Number(year));
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async getPyqById(id) {
    const { data, error } = await this.clientOrThrow
      .from('rc_pyq_catalog')
      .select('*')
      .eq('id', Number(id))
      .single();
    if (error) return null;
    return data;
  }

  async updatePyqLinked(pyqId, linkedTestId) {
    const { data, error } = await this.clientOrThrow
      .from('rc_pyq_catalog')
      .update({ linked_test_id: linkedTestId })
      .eq('id', Number(pyqId))
      .select('*')
      .single();
    if (error) console.warn('[SupabaseDataStore] updatePyqLinked warning:', error.message);
    return data;
  }

  async getLiveArenaData() {
    const supabase = this.clientOrThrow;
    const { data: liveTests, error: liveErr } = await supabase
      .from('rc_tests')
      .select('*')
      .eq('category', 'live')
      .order('is_live_featured', { ascending: false })
      .order('id', { ascending: false });

    if (liveErr) throw liveErr;

    const activeTest = (liveTests || []).find((t) => t.is_live_featured) || (liveTests || [])[0] || null;
    const archiveTests = (liveTests || []).filter((t) => !activeTest || t.id !== activeTest.id);

    let leaderboard = [];
    if (activeTest) {
      const { data: attempts, error: lbErr } = await supabase
        .from('rc_attempts')
        .select('id, user_id, user_name, score, max_score, correct_count, wrong_count, total_questions, time_seconds, created_at')
        .eq('test_id', activeTest.id)
        .order('score', { ascending: false })
        .order('time_seconds', { ascending: true })
        .limit(30);

      if (lbErr) throw lbErr;
      leaderboard = attempts || [];
    }

    return { activeTest, leaderboard, archiveTests };
  }

  async listGuides(category, slug) {
    const supabase = this.clientOrThrow;
    if (slug) {
      const { data, error } = await supabase.from('rc_guides').select('*').eq('slug', slug).single();
      if (error) return null;
      return data;
    }
    let q = supabase.from('rc_guides').select('*').order('id', { ascending: true });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async listAttempts(filters = {}) {
    const supabase = this.clientOrThrow;
    let q = supabase
      .from('rc_attempts')
      .select('*, rc_tests(id, title, topic, source_label, exam_type, difficulty, category, word_count)')
      .order('created_at', { ascending: false });

    if (filters.user_id) q = q.eq('user_id', filters.user_id);
    if (filters.test_id) q = q.eq('test_id', Number(filters.test_id));
    const { data, error } = await q.limit(100);
    if (error) throw error;
    return data || [];
  }

  async createAttempt(attemptData) {
    const supabase = this.clientOrThrow;
    const { data: inserted, error } = await supabase
      .from('rc_attempts')
      .insert({
        ...attemptData,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) throw error;

    const { data: peerAttempts } = await supabase
      .from('rc_attempts')
      .select('id, score, time_seconds')
      .eq('test_id', Number(attemptData.test_id))
      .order('score', { ascending: false })
      .order('time_seconds', { ascending: true });

    let rank = 1;
    const totalPeers = peerAttempts?.length || 1;
    if (peerAttempts) {
      const idx = peerAttempts.findIndex((a) => a.id === inserted.id);
      if (idx >= 0) rank = idx + 1;
    }

    return { attempt: inserted, rank, totalPeers };
  }
}

// Single active store instance
let activeStore = null;

export function getDataLayer() {
  if (!activeStore) {
    activeStore = DATA_MODE === 'supabase' ? new SupabaseDataStore() : new LocalDataStore();
  }
  return activeStore;
}
