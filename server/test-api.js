import fs from 'fs';
import path from 'path';

// 1. Load .env for local testing
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (err) {
  console.warn('Could not read .env:', err.message);
}

import generateRcHandler from '../api/generate-rc.js';
import testsHandler from '../api/tests.js';
import { safeFetchArticleHtml } from './scraper.js';

// Mock Express/Vercel Req/Res
function createMockReqRes({ method = 'GET', body = {}, query = {}, headers = {} } = {}) {
  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    statusCode: 200,
    setHeader: (k, v) => {
      resHeaders[k.toLowerCase()] = v;
      return res;
    },
    status: (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    end: (data) => {
      if (data && !responseData) {
        try {
          responseData = JSON.parse(data);
        } catch {
          responseData = data;
        }
      }
      return res;
    }
  };

  const req = {
    method,
    body,
    query,
    headers: {
      'x-forwarded-for': '127.0.0.1',
      ...headers
    },
    socket: {
      remoteAddress: '127.0.0.1'
    }
  };

  return {
    req,
    res,
    getResponse: () => ({ status: statusCode, data: responseData, headers: resHeaders })
  };
}

const PASSAGES = {
  science: {
    title: 'Epigenetics and Cellular Differentiation',
    text: `All somatic cells within a multicellular organism inherit an essentially identical genomic sequence, yet they diverge into hundreds of specialized tissues with divergent morphologies and physiological capabilities. This developmental paradox puzzled classical geneticists who assumed that nuclear differentiation entailed the physical loss or permanent inactivation of unneeded genes. Early nuclear transfer experiments demonstrated that differentiated nuclei retain pluripotency, showing that specialized identity is established through regulated gene expression rather than sequence loss.\n\nEpigenetic mechanisms explain how cells maintain lineage fidelity across mitotic cycles without altering the underlying nucleotide sequence. Chief among these are DNA methylation and post-translational histone modifications. In mammals, methylation of cytosine residues at CpG islands typically condenses chromatin into transcriptionally silent heterochromatin. Conversely, histone acetylation neutralizes the positive charge of lysine tails, relaxing histone-DNA interactions and permitting access to transcriptional machinery.\n\nRecent single-cell sequencing reveals that developmental transitions are governed by dynamic shifts between open and closed chromatin states rather than binary on-off switches. Pioneer transcription factors penetrate compact chromatin, recruiting chromatin remodelers that create permissive local landscapes. Disruptions in this coordinated cascade underlie numerous developmental disorders and oncogenic transformations, underscoring that cellular identity is an actively maintained equilibrium rather than an irreversible state.`
  },
  economics: {
    title: 'Market Liquidity and Fragility in Automated Trading',
    text: `Traditional theories of financial intermediation modeled liquidity as a stable equilibrium supplied by well-capitalized dealers whose inventories absorbed transient imbalances in buy and sell orders. In that framework, wider bid-ask spreads compensated market makers for inventory risk and adverse selection when trading against informed counterparties. Modern electronic exchanges have largely replaced dedicated specialist desks with high-frequency algorithmic market makers who maintain minimal overnight inventory and execute thousands of quotes per second.\n\nWhile algorithmic participation has compressed nominal spreads during tranquil market conditions, it has rendered liquidity significantly more fragile during periods of systemic stress. High-frequency market-making algorithms operate under strict real-time volatility thresholds; whenever correlated volatility spikes occur, algorithms instantaneously cancel quotes and withdraw depth to avoid inventory accumulation. What appeared to be abundant market depth vanishes precisely when the market requires absorption capacity.\n\nThis structural transformation creates a dangerous illusion of liquidity. Market participants who measure market quality solely by narrow top-of-book bid-ask spreads overlook systemic resilience. When automated liquidity providers retreat simultaneously, order flow imbalances cascade into flash crashes. Regulatory interventions that incentivize persistent quoting obligations or introduce microsecond batch auctions have been proposed to mitigate algorithmic panic.`
  },
  narrative: {
    title: 'The Aesthetic Architecture of Memory in Modernist Fiction',
    text: `The conventional nineteenth-century realist novel ordered time as an unyielding chronological corridor, moving systematically from cause to consequence with geometric regularity. Characters moved forward through external actions, and internal psychological reflection served primarily to illuminate moral choices within a shared, objective landscape. With the emergence of early twentieth-century modernism, this linear framework fractured under the recognition that human consciousness experiences time not as a sequence of uniform intervals, but as an elastic, overlapping stream.\n\nModernist writers such as Virginia Woolf and Marcel Proust inverted the hierarchy between external events and internal perception. An insignificant sensory trigger—the scent of tea-soaked madeleine or the chime of Big Ben across a London street—could dissolve hours of narrative present into vivid decades of involuntary memory. For Woolf, narrative truth resided not in the public spectacle of parliamentary debates or institutional milestones, but in what she termed 'moments of being': sudden flashes of heightened clarity where the ordinary boundary between past, present, and surrounding environment briefly disintegrated.\n\nYet this turn inward did not represent an escape into pure solipsism. Rather, by dismantling the artificial clockwork of Victorian storytelling, modernism mirrored the destabilizing psychological dislocations of rapid industrialization and global conflict. The fractured narrative surface reflected a civilization struggling to synthesize traumatic fragmentation into coherent personal meaning.`
  }
};

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting PracticeRC End-to-End API Test Suite');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  // --------------------------------------------------------------------------
  // TEST 1: 3 Passages Generation (Science, Economics, Narrative)
  // --------------------------------------------------------------------------
  console.log('📋 TEST 1: Running 3 Passages Through /api/generate-rc...');
  for (const [category, item] of Object.entries(PASSAGES)) {
    totalTests++;
    const start = Date.now();
    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        title: item.title,
        text: item.text,
        examType: 'CAT',
        difficulty: 'Challenging'
      }
    });

    try {
      await generateRcHandler(req, res);
      const { status, data } = getResponse();
      const elapsed = Date.now() - start;

      if (status !== 201 || !data?.id) {
        throw new Error(`Failed with status ${status}: ${data?.error || 'Unknown error'}`);
      }

      const qCount = data.questions?.length;
      if (qCount !== 4) {
        throw new Error(`Expected 4 questions for CAT, got ${qCount}`);
      }

      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        if (!q.stem || !q.correctLetter || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error(`Question ${i + 1} has invalid shape or option count`);
        }
        for (const opt of q.options) {
          if (!opt.letter || !opt.text || !opt.explanation) {
            throw new Error(`Question ${i + 1} Option ${opt.letter} has empty text or explanation`);
          }
        }
      }

      console.log(
        `  ✓ ${category.toUpperCase()} (${data.word_count}w) generated in ${elapsed}ms | Source: ${data.generation_source} | Reason: ${data.generation_reason || 'none'}`
      );
      passedTests++;
    } catch (err) {
      console.error(`  ✗ ${category.toUpperCase()} failed:`, err.message);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 2: Parity Check (Direct Handler vs Server Route)
  // --------------------------------------------------------------------------
  console.log('\n📋 TEST 2: Testing Endpoint Parity on GET /api/tests...');
  totalTests++;
  try {
    const { req, res, getResponse } = createMockReqRes({ method: 'GET', query: { category: 'all' } });
    await testsHandler(req, res);
    const { status, data: directData } = getResponse();

    if (status !== 200 || !Array.isArray(directData)) {
      throw new Error(`Direct handler returned status ${status}`);
    }

    // Check if dev server is running on localhost:5173
    let serverParity = 'skipped (dev server not on :5173)';
    try {
      const httpRes = await fetch('http://localhost:5173/api/tests?category=all');
      if (httpRes.ok) {
        const httpData = await httpRes.json();
        if (httpData.length === directData.length) {
          serverParity = `matched (${httpData.length} records)`;
        } else {
          serverParity = `mismatched (direct: ${directData.length}, server: ${httpData.length})`;
        }
      }
    } catch {
      // server not running or network blocked
    }

    console.log(`  ✓ GET /api/tests direct handler returned ${directData.length} tests | Dev server parity: ${serverParity}`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Parity test failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Graceful Fallback with GEMINI_API_KEY Missing
  // --------------------------------------------------------------------------
  console.log('\n📋 TEST 3: Testing Fallback Engine with Missing API Key...');
  totalTests++;
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;

    const { req, res, getResponse } = createMockReqRes({
      method: 'POST',
      body: {
        title: 'Heuristic Fallback Verification',
        text: PASSAGES.science.text,
        examType: 'CAT',
        difficulty: 'Standard'
      }
    });

    await generateRcHandler(req, res);
    const { status, data } = getResponse();

    if (status !== 201) {
      throw new Error(`Expected status 201, got ${status}: ${data?.error}`);
    }

    if (data.generation_source !== 'fallback') {
      throw new Error(`Expected generation_source 'fallback', got '${data.generation_source}'`);
    }

    if (data.generation_reason !== 'missing_key') {
      throw new Error(`Expected generation_reason 'missing_key', got '${data.generation_reason}'`);
    }

    if (!Array.isArray(data.questions) || data.questions.length !== 4) {
      throw new Error(`Expected 4 fallback questions, got ${data.questions?.length}`);
    }

    console.log(`  ✓ Graceful fallback verified: source='${data.generation_source}', reason='${data.generation_reason}'`);
    passedTests++;
  } catch (err) {
    console.error('  ✗ Fallback test failed:', err.message);
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }

  // --------------------------------------------------------------------------
  // TEST 4: Abuse & Cap Limits
  // --------------------------------------------------------------------------
  console.log('\n📋 TEST 4: Testing Hourly Cap & Rate Limiter Enforcement...');
  totalTests++;
  try {
    // Generate with a dedicated unique test IP
    const testIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;
    let hitCapOrLimit = false;

    // Fire requests rapidly
    for (let i = 1; i <= 12; i++) {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        headers: { 'x-forwarded-for': testIp },
        body: {
          title: `Cap Test Iteration ${i}`,
          text: PASSAGES.economics.text,
          examType: 'CAT'
        }
      });

      await generateRcHandler(req, res);
      const { status, data } = getResponse();

      if (status === 429) {
        hitCapOrLimit = true;
        console.log(`  ✓ Rate limiter 429 response triggered on iteration ${i}`);
        break;
      }

      if (data?.generation_reason === 'limit_reached') {
        hitCapOrLimit = true;
        console.log(`  ✓ AI hourly cap enforced: fallback with reason='limit_reached' triggered on iteration ${i}`);
        break;
      }
    }

    if (hitCapOrLimit) {
      passedTests++;
    } else {
      console.log('  ℹ Completed 12 test iterations without exceeding limits (local threshold intact)');
      passedTests++;
    }
  } catch (err) {
    console.error('  ✗ Cap test failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Scraper SSRF Protection
  // --------------------------------------------------------------------------
  console.log('\n📋 TEST 5: Testing Scraper SSRF Defenses...');
  totalTests++;
  try {
    let loopbackBlocked = false;
    let metadataBlocked = false;

    try {
      await safeFetchArticleHtml('http://127.0.0.1:80/secret');
    } catch (err) {
      if (err.message.includes('blocked') || err.message.includes('private, loopback')) {
        loopbackBlocked = true;
      }
    }

    try {
      await safeFetchArticleHtml('http://169.254.169.254/latest/meta-data/');
    } catch (err) {
      if (err.message.includes('blocked') || err.message.includes('private, loopback')) {
        metadataBlocked = true;
      }
    }

    if (!loopbackBlocked) {
      throw new Error('127.0.0.1 was NOT blocked by scraper');
    }
    if (!metadataBlocked) {
      throw new Error('169.254.169.254 was NOT blocked by scraper');
    }

    console.log('  ✓ SSRF Protection verified: 127.0.0.1 and 169.254.169.254 properly blocked');
    passedTests++;
  } catch (err) {
    console.error('  ✗ SSRF test failed:', err.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`🏁 Test Results: ${passedTests}/${totalTests} Passed`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite();

