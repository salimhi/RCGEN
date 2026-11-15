import fs from 'fs';
import { generateRcQuestions } from '../src/lib/geminiClient.ts';

const envPath = ['archive/.env', '.env'].find((f) => fs.existsSync(f));
if (!envPath) {
  console.error('No .env or archive/.env found');
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY=\s*([^\s\r\n]+)/);
if (!keyMatch) {
  console.error('GEMINI_API_KEY not found');
  process.exit(1);
}
const apiKey = keyMatch[1].trim();

// Three realistic passages of ~550-650 words each across distinct disciplines
const PASSAGES = [
  {
    topic: 'Philosophy & Cognitive Epistemology',
    paragraphs: [
      `Discussions of modern digital technology routinely begin from a reassuringly linear premise: that expanding access to networked information democratizes knowledge and levels epistemic playing fields. Across much of contemporary platform design, that expectation has functioned less as an empirical finding than as an organizing faith. To a point, the faith is understandable. Networked repositories do eliminate physical barriers to information, and no serious educator proposes a return to pre-digital gatekeeping. What the linear view obscures, however, is that expanding the sheer volume of stimuli frequently degrades the cognitive conditions required to evaluate it.`,
      `This divergence is not an accidental byproduct of user indiscipline; it follows from the commercial architecture of attention extraction itself. Whenever platform profitability depends on engagement metrics rather than conceptual understanding, algorithms inevitably optimize for reflexive emotional capture rather than deliberative scrutiny. Analysts who evaluate platform health purely by operational activity treat as vibrant civic discourse what is, in truth, manufactured volatility. Were the problem merely lack of digital literacy, instructional modules would resolve it. Because the tension concerns how platform architectures systematically penalize quiet reflection, additional screen time often deepens cognitive fragmentation instead of correcting it.`,
      `Historical parallels illuminate the underlying dynamic. Earlier transformations in communication—from the rapid spread of the printing press to the emergence of mass-market tabloids—were accompanied by utopian assurances that cheaper print would depoliticize dispute and enlighten the public. Yet the historical record reveals almost the opposite trajectory: whenever the cost of publishing plummeted without corresponding developments in verification institutions, polarization and sensationalist panic intensified. What altered over time was not the presence of human curiosity, but the institutional incentives under which that curiosity was commodified.`,
      `Defenders of engagement-driven ranking reply that algorithmic feeds merely reflect authentic public demand: users get what they click on. That defence carries superficial weight, but it conflates instinctive impulse with reflective preference. What cannot easily be monetized—deep contemplative reading, nuanced synthesis, and second-order doubt—drops out of algorithmic curation, acquiring the false appearance of obsolescence simply because it resists neat monetization. The deeper lesson regarding the attention economy is therefore neither uncritical technophilia nor fatalistic luddism. Rather, healthy democratic inquiry requires recognizing that attention is an exhaustible ecological commons: whenever platforms enclose that commons for private yield, the resulting cognitive exhaustion threatens deliberation.`
    ]
  },
  {
    topic: 'Economic History & Institutional Economics',
    paragraphs: [
      `In the standard neoclassical narrative of financial history, the evolution of market institutions is depicted as an inevitable progression toward allocative efficiency. According to this account, primitives such as double-entry bookkeeping, standardized bills of exchange, and centralized stock bourses emerged spontaneously whenever the volume of mercantile trade reached critical thresholds. Transaction costs fell, information asymmetries dissolved, and capital flowed smoothly to its highest-valued employment. Yet closer inspection of late medieval Italian republics reveals a far more contingent and contested institutional lineage.`,
      `The emergence of negotiable credit instruments was less a triumph of abstract market logic than a pragmatic improvisation designed to circumvent ecclesiastical prohibitions against usury. Medieval canon law strictly forbade the charging of interest on pure monetary loans, classifying any return above principal as sinful extortion. Northern Italian merchant bankers responded not by defying papal authority, but by re-engineering debt contracts into foreign exchange transactions (cambio). By bundling credit extension with currency conversions scheduled in distant trade fairs, lenders disguised interest payments as compensation for foreign exchange risks. Commercial innovation, in other words, operated through legal evasion rather than deregulated liberty.`,
      `Furthermore, market liquidity did not flourish in an institutional vacuum of pure private enforcement. While early modern merchant guilds did develop sophisticated internal arbitration mechanisms to punish contractual default, these private orderings relied heavily upon municipal coercion. A merchant excluded from guild privileges faced not merely reputational censure, but physical exile and asset confiscation enforced by communal magistrates. Where sovereign states lacked coercive administrative capacity, financial markets remained fragmented and chronically undercapitalized.`,
      `This historical reality exposes the central paradox of financial development: markets require sovereign state power to guarantee property rights and enforce contracts, yet that same sovereign capacity represents the greatest systemic threat of opportunistic expropriation. The enduring contribution of the Mediterranean mercantile revolution was therefore not merely the invention of technical instruments, but the constitutional containment of sovereign predation through shared civic governance.`
    ]
  },
  {
    topic: 'Evolutionary Biology & Phenotypic Plasticity',
    paragraphs: [
      `For much of the twentieth century, evolutionary biology was dominated by the Modern Synthesis, a theoretical framework that united Mendelian genetics with Darwinian natural selection. Under this paradigm, morphological and behavioral adaptations were viewed almost exclusively as the downstream manifestations of discrete genetic variations. Genes proposed; natural selection disposed. Organisms were perceived primarily as passive vehicles through which competitive alleles maneuvered for generational representation. While extraordinarily generative, this strictly genocentric schema struggled to explain the rapidity with which certain species adapt to abrupt environmental volatility.`,
      `Recent advances in developmental plasticity and epigenetics have unsettled this rigid hierarchy. Phenotypic plasticity—the capacity of a single genome to produce distinct morphological or physiological variants in response to diverse ecological cues—demonstrates that developmental trajectories are not rigidly pre-programmed algorithms. When water fleas of the genus Daphnia detect predatory kairomones in their aquatic habitat, they develop defensive cranial helmets and spine armor within a single generation, despite possessing identical genomic sequences to unarmored conspecifics. Here, the environment acts not merely as a passive selective sieve, but as an active developmental cue.`,
      `Crucially, developmental plasticity can actively precede and direct subsequent genetic evolution, a dynamic encapsulated in the concept of genetic accommodation. When an environmental perturbation induces novel phenotypic expressions across a population, these developmental variants expose hidden genetic variation to selective scrutiny. If a newly induced trait confers superior survival, selection will progressively favor regulatory mutations that stabilize and refine the phenotype, eventually rendering its expression independent of the initiating trigger.`,
      `Recognizing phenotypic plasticity as a core evolutionary mechanism does not repudiate Darwinian selection; rather, it enriches our understanding of macroevolutionary tempo and mode. Instead of waiting for exceedingly rare beneficial point mutations to arise de novo, populations can respond rapidly to novel ecological challenges through physiological flexibility, subsequently canalizing those adaptations through genomic reorganization over generational time.`
    ]
  }
];

async function runDiagnosticSuite() {
  console.log('🚀 Running Gemini generation diagnostics on 3 realistic 600-word passages...\n');

  for (let i = 0; i < PASSAGES.length; i++) {
    const item = PASSAGES[i];
    console.log(`========================================================================`);
    console.log(`Passage ${i + 1}: ${item.topic}`);
    const wordCount = item.paragraphs.join(' ').split(/\s+/).length;
    console.log(`Word Count: ${wordCount} words (${item.paragraphs.length} paragraphs)`);

    const result = await generateRcQuestions({
      paragraphs: item.paragraphs,
      title: item.topic,
      examType: 'CAT',
      difficulty: 'Challenging',
      engine: 'gemini',
      geminiKey: apiKey
    });

    console.log(`\nResult Source: "${result.source}"`);
    if (result.reason) {
      console.log(`Fallback Reason: "${result.reason}"`);
    }

    const diag = result.diagnostics || {};
    console.log(`HTTP Status: ${diag.httpStatus ?? 'N/A'}`);
    console.log(`finishReason: ${diag.finishReason ?? 'N/A'}`);
    console.log(`Token Usage:`, diag.tokenUsage ?? 'N/A');
    console.log(`Questions Returned: ${diag.questionsReturned ?? 0}`);
    console.log(`Questions Passed Verification: ${diag.questionsPassed ?? 0}`);

    if (diag.rejectionReasons && diag.rejectionReasons.length > 0) {
      console.log(`Rejections:`, diag.rejectionReasons);
    }

    console.log(`\nQuestions generated (${result.questions.length}):`);
    result.questions.forEach((q, qIdx) => {
      console.log(`  Q${qIdx + 1} [${q.type}] Stem: "${q.stem.slice(0, 65)}..."`);
      console.log(`     Correct: ${q.correctLetter} | Options: ${q.options.length}`);
    });

    console.log(`\nVerification: ${result.source === 'ai' && result.questions.length >= 4 ? '✅ PASSED (AI)' : '⚠️ FALLBACK'}\n`);
  }
}

runDiagnosticSuite();
