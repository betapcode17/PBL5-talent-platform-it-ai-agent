import express from 'express';
import multer from 'multer';
import pdfService from '../services/pdfService.js';
import conversationStore from '../services/conversationStore.js';
import { runCvCareerAgent } from '../agents/cvCareerAgent.js';
import { executeCvTool } from '../tools/cvTools.js';
import backendClient from '../services/backendClient.js';

const router = express.Router();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helper: Fix Multer Latin1 UTF-8 filename encoding
function decodeOriginalName(rawName) {
  if (!rawName) return 'CV.pdf';
  try {
    const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD') && /[ÃÂÁÀẢÃẠĂẮẰẲẴẶĐÉÈẺẼẸÊÍÌỈĨỊÓÒỎÕỌÔƠÚÙỦŨỤƯÝỲỶỸỴáàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/.test(rawName)) {
      return decoded;
    }
    return rawName;
  } catch (e) {
    return rawName;
  }
}

// POST /cv/analyze
router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a CV PDF file.' });
    }

    const fileName = decodeOriginalName(req.file.originalname);
    let cvText = await pdfService.extractText(req.file.buffer);
    if (!cvText || cvText.trim().length === 0) {
      cvText = `Hồ sơ: ${fileName}. Ứng viên ngành Công nghệ thông tin.`;
    }
    const parsed = pdfService.extractCvInfo(cvText);

    // Compute baseline structured analysis (fast & deterministic)
    const localAnalysis = await executeCvTool('analyze_cv_content', { cvText });

    // Resolve conversation (reuse if provided from frontend)
    const inputConvId = req.body.conversation_id || req.body.conversationId;
    let conv = null;
    if (inputConvId) {
      conv = await conversationStore.getConversation(inputConvId);
    }
    if (!conv) {
      const conversationTitle = `Phân tích CV - ${fileName.substring(0, 30)}`;
      conv = await conversationStore.createConversation(conversationTitle, 'job_chat');
    }

    // User note if provided
    const userNote = (req.body.note || '').trim();

    // Call CvCareerAgent with Gemini 2.5 Flash for deep professional analysis
    const userPrompt = [
      `Dưới đây là toàn bộ nội dung bản CV của ứng viên (${fileName}):`,
      '---',
      cvText,
      '---',
      userNote ? `Yêu cầu cụ thể từ ứng viên: "${userNote}"\n` : '',
      'Hãy thẩm định và phân tích chuyên sâu bản CV này với vai trò Senior Tech Recruiter & Career Coach:',
      '1. Đánh giá chất lượng hồ sơ theo chuẩn ATS (chấm điểm khách quan trên thang điểm 10 kèm phân tích lý do).',
      '2. Điểm mạnh thực tế (kỹ năng công nghệ, kinh nghiệm dự án thực tế, quá trình làm việc, học vấn).',
      '3. Điểm yếu và các phần cần cải thiện (thiếu sót về số liệu đo lường STAR, công nghệ hiện đại, cách trình bày).',
      '4. Xây dựng Lộ trình phát triển kỹ năng (Career Roadmap) theo 3 giai đoạn rõ ràng và đưa ra các lời khuyên hữu ích để ứng tuyển thành công.',
    ].filter(Boolean).join('\n');

    let agentResult;
    try {
      agentResult = await runCvCareerAgent({
        userMessage: userPrompt,
        extraContext: `Tên file CV: ${fileName}`,
        conversationId: conv.id,
      });
    } catch (agentErr) {
      console.warn('[Route /cv/analyze] Gemini agent call failed, using local analysis fallback:', agentErr.message);
      agentResult = {
        content: `### 📋 Báo Cáo Thẩm Định & Đánh Giá Hồ Sơ CV: **${fileName}**\n\n` +
          `⭐ **Điểm đánh giá ATS:** **${localAnalysis.qualityScore}/10**\n\n` +
          `**1. Điểm mạnh cốt lõi:**\n${localAnalysis.strengths.map(s => `- ${s}`).join('\n')}\n\n` +
          `**2. Các phần cần cải thiện:**\n${localAnalysis.weaknesses.map(w => `- ${w}`).join('\n')}\n\n` +
          `**3. Lời khuyên tối ưu hồ sơ:**\n${localAnalysis.recommendations.map(r => `- ${r}`).join('\n')}\n\n` +
          `**4. Lộ trình phát triển đề xuất:**\n` +
          `- **Giai đoạn 1 (1-2 tháng):** Củng cố nền tảng lập trình hướng đối tượng, Clean Code và thiết kế cơ sở dữ liệu.\n` +
          `- **Giai đoạn 2 (2-3 tháng):** Xây dựng dự án Fullstack thực tế có triển khai Docker và CI/CD, đính kèm link demo trực tiếp trong CV.\n` +
          `- **Giai đoạn 3 (1 tháng):** Luyện tập thuật toán, System Design cơ bản và chuẩn bị kỹ năng phỏng vấn tình huống (STAR).`,
        cvAnalysis: localAnalysis,
        toolCalls: [{ name: 'analyze_cv_content', args: { cvText } }],
      };
    }

    const finalCvAnalysis = agentResult.cvAnalysis || localAnalysis;

    // Search relevant jobs from system based on detected skills
    let matchedJobs = [];
    try {
      const skillsQuery = (parsed.skills || []).slice(0, 3).join(' ') || 'Web Developer';
      const jobResults = await backendClient.searchJobs({
        query: skillsQuery,
        limit: 4,
      });
      const rawJobs = Array.isArray(jobResults) ? jobResults : (jobResults.data || jobResults.items || []);
      matchedJobs = rawJobs.map((j) => ({
        job_id: j.id ? (Number(j.id) || j.id) : null,
        id: String(j.id || ''),
        job_title: j.title || 'Kỹ sư phần mềm',
        title: j.title || 'Kỹ sư phần mềm',
        company_name: j.company?.name || 'Công ty tuyển dụng',
        company: j.company?.name || 'Công ty tuyển dụng',
        match_score: 85,
        matched_skills: (parsed.skills || []).slice(0, 4),
        missing_skills: [],
        location: j.location || 'Toàn quốc',
        work_location: j.location || 'Toàn quốc',
        salary: j.salaryRange || 'Thỏa thuận',
        work_type: j.jobType?.name || 'Toàn thời gian',
        skills: Array.isArray(j.requirements) ? j.requirements : [],
        url: j.id ? `/jobs/${j.id}` : '#',
      }));
    } catch (e) {
      console.warn('Could not fetch matched jobs for CV:', e.message);
    }

    // Fallback jobs preview if backend is offline
    if (matchedJobs.length === 0 && parsed.skills && parsed.skills.length > 0) {
      const skillName = parsed.skills[0].toUpperCase();
      matchedJobs = [
        {
          job_id: 1,
          id: '1',
          job_title: `Lập trình viên ${skillName} (Junior/Mid)`,
          title: `Lập trình viên ${skillName} (Junior/Mid)`,
          company_name: 'Tech Solutions Corporation',
          company: 'Tech Solutions Corporation',
          match_score: 88,
          matched_skills: parsed.skills.slice(0, 3),
          missing_skills: ['Docker', 'CI/CD'],
          location: 'Hà Nội / Hybrid',
          work_location: 'Hà Nội / Hybrid',
          salary: '15 - 28 triệu VNĐ',
          work_type: 'Toàn thời gian',
          skills: parsed.skills.slice(0, 4),
          url: '#',
        },
        {
          job_id: 2,
          id: '2',
          job_title: `Fullstack Developer (${parsed.skills.slice(0, 2).join(' / ')})`,
          title: `Fullstack Developer (${parsed.skills.slice(0, 2).join(' / ')})`,
          company_name: 'NextGen Innovation Hub',
          company: 'NextGen Innovation Hub',
          match_score: 82,
          matched_skills: parsed.skills.slice(0, 2),
          missing_skills: ['System Design'],
          location: 'Hồ Chí Minh / Remote',
          work_location: 'Hồ Chí Minh / Remote',
          salary: '18 - 35 triệu VNĐ',
          work_type: 'Toàn thời gian',
          skills: parsed.skills.slice(0, 4),
          url: '#',
        },
      ];
    }

    const cvId = Date.now();
    const formattedInsights = {
      cv_id: cvId,
      quality_score: finalCvAnalysis.qualityScore || 8.0,
      qualityScore: finalCvAnalysis.qualityScore || 8.0,
      completeness: finalCvAnalysis.completeness || {
        hasContact: Boolean(parsed.email && parsed.phone),
        hasSkills: (parsed.skills || []).length > 0,
        hasProjects: parsed.hasProjects,
        hasExperience: parsed.hasExperience,
      },
      market_fit: {
        score: Math.min(95, Math.round((finalCvAnalysis.qualityScore || 8) * 10)),
        level: (finalCvAnalysis.qualityScore || 8) >= 8 ? 'Rất tốt' : 'Khá tốt',
      },
      strengths: finalCvAnalysis.strengths || [],
      weaknesses: finalCvAnalysis.weaknesses || [],
      recommendations: finalCvAnalysis.recommendations || [],
      last_analyzed: new Date().toISOString(),
    };

    const learningSuggestions = (finalCvAnalysis.weaknesses || []).map((w, idx) => ({
      skill: ['Tối ưu STAR & Metrics', 'Chứng chỉ Cloud (AWS/Azure)', 'Docker & CI/CD Pipeline'][idx] || 'Nâng cao kỹ năng chuyên môn',
      reason: w,
      related_jobs_count: 12 + idx * 5,
      example_jobs: ['Senior Software Engineer', 'DevOps Specialist'],
      priority: idx === 0 ? 'high' : 'medium',
    }));

    const marketSummary = {
      demandLevel: 'Cao',
      topMatchingFields: ['Web Development', 'Backend Engineering', 'Cloud Services'],
      averageSalaryRange: '18 - 35 triệu VNĐ',
    };

    // Save assistant message to conversation store
    const assistantMsg = await conversationStore.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: agentResult.content,
      messageType: 'cv_analysis',
      detectedIntent: 'cv_analysis',
      jobResults: matchedJobs,
      jobResultsTotal: matchedJobs.length,
      jobResultsSummary: matchedJobs.length ? `Gợi ý ${matchedJobs.length} vị trí phù hợp với hồ sơ của bạn` : null,
      cvAnalysis: formattedInsights,
      toolCalls: agentResult.toolCalls,
    });

    res.json({
      success: true,
      cv_id: cvId,
      filename: fileName,
      conversation_id: conv.id,
      conversationId: conv.id,
      conversation_message_id: assistantMsg.id,
      content: agentResult.content,
      message: assistantMsg,
      parsed_cv: parsed,
      insights: formattedInsights,
      jobs: matchedJobs,
      matched_jobs: matchedJobs,
      learning_suggestions: learningSuggestions,
      market_summary: marketSummary,
      toolCalls: agentResult.toolCalls,
    });
  } catch (err) {
    console.error('[Route /cv/analyze] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /cv/match-jd
router.post('/match-jd', upload.single('file'), async (req, res) => {
  try {
    let cvText = '';
    let fileName = 'CV.pdf';
    if (req.file) {
      fileName = decodeOriginalName(req.file.originalname);
      cvText = await pdfService.extractText(req.file.buffer);
    } else if (req.body.cvText) {
      cvText = req.body.cvText;
    } else {
      return res.status(400).json({ error: 'Please provide either a CV file or cvText.' });
    }

    const { jd_text, jobId, conversation_id } = req.body;
    if (!jd_text && !jobId) {
      return res.status(400).json({ error: 'Please provide either jd_text or jobId.' });
    }

    const matchResult = await executeCvTool('match_cv_with_jd', {
      cvText,
      jdText: jd_text,
      jobId: jobId ? parseInt(jobId, 10) : undefined,
    });

    let resolvedConvId = conversation_id;
    if (!resolvedConvId) {
      const conv = await conversationStore.createConversation(`So khớp CV - ${matchResult.jobTitle}`, 'job_chat');
      resolvedConvId = conv.id;
    }

    const formattedMessage = [
      `### 🎯 Kết Quả Đánh Giá Độ Phù Hợp: **${matchResult.jobTitle}** (${matchResult.jobCompany})`,
      '',
      `⭐ **Mức độ tương thích:** **${matchResult.matchScore}%** — *${matchResult.fitLevel}*`,
      '',
      `✅ **Kỹ năng đã đáp ứng:** ${matchResult.matchedSkills.length ? matchResult.matchedSkills.join(', ') : 'Chưa ghi nhận'}`,
      `⚠️ **Kỹ năng cần bổ sung (Skills Gap):** ${matchResult.missingSkills.length ? matchResult.missingSkills.join(', ') : 'Không có'}`,
      '',
      `💡 **Lời khuyên ứng tuyển:** ${matchResult.advice}`,
    ].join('\n');

    const assistantMsg = await conversationStore.addMessage({
      conversationId: resolvedConvId,
      role: 'assistant',
      content: formattedMessage,
      messageType: 'cv_jd_match',
      detectedIntent: 'cv_jd_match',
      cvJdMatch: matchResult,
    });

    res.json({
      success: true,
      conversation_id: resolvedConvId,
      conversation_message_id: assistantMsg.id,
      content: formattedMessage,
      message: assistantMsg,
      ...matchResult,
    });
  } catch (err) {
    console.error('[Route /cv/match-jd] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
