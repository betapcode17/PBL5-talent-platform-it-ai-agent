import { executeTool } from '../tools/index.js';
import conversationStore from '../services/conversationStore.js';
import orchestrator from '../agents/orchestrator.js';

async function runTests() {
  console.log('🧪 Starting AI-agents Multi-Agent System Unit & Integration Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // ================= 1. Nhóm A: Job Search Tools =================
  console.log('--- Testing Nhóm A: Tìm kiếm việc làm ---');
  try {
    const jobRes = await executeTool('search_jobs', { query: 'NodeJS Developer', limit: 3 });
    assert(jobRes && Array.isArray(jobRes.jobs), 'Tool search_jobs executes and returns jobs array');

    const latestRes = await executeTool('get_latest_jobs', { limit: 2 });
    assert(latestRes && Array.isArray(latestRes.jobs), 'Tool get_latest_jobs executes properly');

    const recRes = await executeTool('recommend_jobs', { skills: ['React', 'JavaScript'], targetRole: 'Frontend Dev' });
    assert(recRes && Array.isArray(recRes.jobs), 'Tool recommend_jobs executes properly');
  } catch (err) {
    console.error('Group A test error:', err.message);
    failed++;
  }

  // ================= 2. Nhóm B: CV Tools =================
  console.log('\n--- Testing Nhóm B: CV & Tư vấn nghề nghiệp ---');
  try {
    const sampleCv = `Nguyen Van A\nEmail: a@example.com\nPhone: 0912345678\nSkills: React, Node.js, TypeScript, PostgreSQL, Docker\nExperience: 2 years frontend developer at Company X.\nProjects: Built E-commerce portal.`;
    const cvAnalysis = await executeTool('analyze_cv_content', { cvText: sampleCv });
    assert(cvAnalysis.qualityScore > 0, 'Tool analyze_cv_content scores CV');
    assert(cvAnalysis.detectedSkills.length > 0, 'Tool analyze_cv_content detects skills');

    const matchRes = await executeTool('match_cv_with_jd', {
      cvText: sampleCv,
      jdText: 'Tuyển dụng Fullstack Developer: Yêu cầu React, Node.js, Docker, Kubernetes, AWS',
    });
    assert(matchRes.matchScore > 0, 'Tool match_cv_with_jd calculates match percentage');
    assert(matchRes.matchedSkills.includes('react'), 'Tool match_cv_with_jd identifies matched skills');

    const roadmapRes = await executeTool('generate_career_roadmap', {
      targetRole: 'Senior Fullstack Engineer',
      missingSkills: ['Kubernetes', 'AWS'],
    });
    assert(roadmapRes.phases && roadmapRes.phases.length > 0, 'Tool generate_career_roadmap generates phased roadmap');
  } catch (err) {
    console.error('Group B test error:', err.message);
    failed++;
  }

  // ================= 3. Nhóm C: System Action Tools =================
  console.log('\n--- Testing Nhóm C: Hành động trên hệ thống ---');
  try {
    // Test apply with confirm=false (should require confirmation)
    const applyPending = await executeTool('apply_job', { jobId: 1, confirm: false });
    assert(applyPending.status === 'pending_confirmation', 'Tool apply_job requests confirmation when confirm=false');

    // Test actions without token (should ask for auth)
    const bookmarkNoAuth = await executeTool('bookmark_job', { jobId: 1 }, { authToken: null });
    assert(bookmarkNoAuth.requiresAuth === true, 'Tool bookmark_job detects missing authentication token');
  } catch (err) {
    console.error('Group C test error:', err.message);
    failed++;
  }

  // ================= 4. Nhóm D: QA Tools =================
  console.log('\n--- Testing Nhóm D: Hỏi đáp & Tra cứu Backend ---');
  try {
    const faqRes = await executeTool('platform_faq', { topic: 'quy trình ứng tuyển' });
    assert(faqRes && faqRes.answer, 'Tool platform_faq answers common platform question');

    const companyRes = await executeTool('get_all_companies', { limit: 2 });
    assert(companyRes && Array.isArray(companyRes.companies), 'Tool get_all_companies executes properly');
  } catch (err) {
    console.error('Group D test error:', err.message);
    failed++;
  }

  // ================= 5. Conversation Store =================
  console.log('\n--- Testing Conversation Store ---');
  try {
    const conv = await conversationStore.createConversation('Test Conv Multi-Agent');
    assert(conv && conv.id, 'createConversation creates conversation ID');

    const msg = await conversationStore.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'Hello AI Agent',
    });
    assert(msg && msg.id, 'addMessage adds message to conversation');

    const history = await conversationStore.getRecentHistory(conv.id);
    assert(history.length === 1, 'getRecentHistory retrieves recent turns');
  } catch (err) {
    console.error('Conversation Store test error:', err.message);
    failed++;
  }

  // ================= 6. Multi-Agent Orchestrator =================
  console.log('\n--- Testing Multi-Agent Orchestrator ---');
  try {
    const conv = await conversationStore.createConversation('Chat Test');
    const result = await orchestrator.chat({
      userMessage: 'Tìm giúp tôi việc làm ReactJS ở Đà Nẵng',
      conversationId: conv.id,
    });
    assert(result.success === true, 'Orchestrator chat executes successfully');
    assert(result.message && result.message.content, 'Orchestrator returns structured assistant message');
    assert(result.data !== undefined, 'Orchestrator returns data object');
  } catch (err) {
    console.error('Orchestrator test error:', err.message);
    failed++;
  }

  console.log(`\n🏁 Test Run Completed: ${passed} Passed, ${failed} Failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
