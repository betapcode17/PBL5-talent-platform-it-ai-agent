import { getGenerativeModel } from '../config/gemini.js';
import config from '../config/env.js';
import { cvToolsDeclarations, executeCvTool } from '../tools/cvTools.js';

export const CV_CAREER_SYSTEM_PROMPT = `=== VAI TRÒ & CHUYÊN MÔN ===
Bạn là SENIOR TECH RECRUITER & CAREER COACH — Chuyên gia cố vấn phát triển sự nghiệp và thẩm định hồ sơ CV công nghệ thông tin.

=== NĂNG LỰC & MỤC TIÊU ===
1. Thẩm định chất lượng CV:
   - Đánh giá cấu trúc hồ sơ theo chuẩn ATS (Applicant Tracking System).
   - Kiểm tra xem CV đã có đầy đủ: Thông tin liên hệ, Kỹ năng công nghệ, Dự án thực tế (Projects), Kinh nghiệm làm việc (Experience) và Học vấn.
   - Hướng dẫn viết mô tả công việc theo công thức STAR (Situation - Task - Action - Result), bổ sung số liệu đo lường cụ thể (Impact Metrics).
2. So khớp CV với JD (Job Description):
   - Phân tích chi tiết: Kỹ năng khớp (Matched Skills) và Kỹ năng còn thiếu (Skills Gap).
   - Tính toán tỷ lệ phần trăm tương thích và đưa ra kết luận trung thực, mang tính xây dựng.
3. Lập Lộ trình phát triển (Career Roadmap):
   - Thiết kế lộ trình 3 giai đoạn: Củng cố kiến thức nền tảng -> Xây dựng dự án mẫu có chiều sâu -> Chuẩn bị kỹ năng phỏng vấn (System Design, Coding interview).

=== CÔNG CỤ ĐƯỢC CẤP ===
- 'analyze_cv_content': Gọi khi người dùng cung cấp text CV hoặc tải lên hồ sơ và muốn chấm điểm, nhận xét điểm mạnh/yếu.
- 'match_cv_with_jd': Gọi khi cần so sánh CV với một Job ID cụ thể hoặc một đoạn JD text.
- 'generate_career_roadmap': Gọi khi người dùng muốn xin lời khuyên định hướng từ vị trí hiện tại lên cấp bậc cao hơn (ví dụ: Junior -> Senior, Frontend -> Fullstack, Software -> AI).

=== NGUYÊN TẮC TƯ VẤN ===
1. Khách quan, trung thực nhưng luôn khích lệ và tạo động lực cho ứng viên.
2. Lời khuyên phải CỤ THỂ, HÀNH ĐỘNG ĐƯỢC (actionable), tránh những lời khuyên chung chung như "hãy cố gắng hơn".
3. Trình bày đẹp mắt bằng Tiếng Việt, sử dụng icon biểu tượng, gạch đầu dòng rõ ràng.`;

import { sanitizeGeminiHistory } from '../utils/historyHelper.js';

export async function runCvCareerAgent({
  userMessage,
  history = [],
  extraContext = null,
  authToken = null,
  conversationId = null,
}) {
  const toolExecutionLog = [];
  let collectedCvAnalysis = null;

  try {
    const model = getGenerativeModel(config.geminiModel, {
      tools: [{ functionDeclarations: cvToolsDeclarations }],
      systemInstruction: CV_CAREER_SYSTEM_PROMPT,
    });

    const formattedHistory = sanitizeGeminiHistory(history);
    const chatSession = model.startChat({ history: formattedHistory });
    const prompt = extraContext
      ? `[Dữ liệu CV / Ngữ cảnh hồ sơ: ${extraContext}]\n\nYêu cầu tư vấn: ${userMessage}`
      : userMessage;

    let result = await chatSession.sendMessage(prompt);
    let functionCalls = result.response.functionCalls();

    let turns = 0;
    while (functionCalls && functionCalls.length > 0 && turns < 3) {
      turns++;
      const call = functionCalls[0];
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log(`[CvCareerAgent] Calling tool: ${toolName}`, toolArgs);
      toolExecutionLog.push({ name: toolName, args: toolArgs });

      let toolRes = {};
      try {
        toolRes = await executeCvTool(toolName, toolArgs, { authToken, conversationId });
        if (toolRes.qualityScore || toolRes.matchScore || toolRes.phases) {
          collectedCvAnalysis = toolRes;
        }
      } catch (err) {
        toolRes = { error: err.message };
      }

      result = await chatSession.sendMessage([
        {
          functionResponse: {
            name: toolName,
            response: toolRes,
          },
        },
      ]);
      functionCalls = result.response.functionCalls();
    }

    return {
      content: result.response.text(),
      cvAnalysis: collectedCvAnalysis,
      toolCalls: toolExecutionLog,
      agentName: 'CvCareerAgent',
      intent: 'cv_analysis',
    };
  } catch (err) {
    console.warn('[CvCareerAgent] Gemini execution error, using deterministic career fallback:', err.message);

    const lower = userMessage.toLowerCase();
    // 1. Roadmap request
    if (lower.includes('lộ trình') || lower.includes('roadmap') || lower.includes('định hướng') || lower.includes('phát triển')) {
      const targetRole = lower.includes('senior') ? 'Senior Fullstack Engineer' : (lower.includes('devops') ? 'DevOps Engineer' : 'Chuyên viên Kỹ thuật Phần mềm');
      toolExecutionLog.push({ name: 'generate_career_roadmap', args: { targetRole } });
      const roadmap = await executeCvTool('generate_career_roadmap', { targetRole });
      collectedCvAnalysis = roadmap;

      const phasesText = roadmap.phases.map((p) =>
        `#### 📍 ${p.phase}\n- **Trọng tâm:** ${p.focus.join(', ')}\n${p.actions.map((a) => `- ${a}`).join('\n')}`
      ).join('\n\n');

      return {
        content: `### 🚀 Lộ Trình Phát Triển Sự Nghiệp Mục Tiêu: **${targetRole}**\n\n${phasesText}\n\n---\n💡 *Bạn có thể tải lên file CV để tôi đánh giá chi tiết mức độ sẵn sàng cho lộ trình này!*`,
        cvAnalysis: roadmap,
        toolCalls: toolExecutionLog,
        agentName: 'CvCareerAgent',
        intent: 'cv_analysis',
      };
    }

    // 2. CV Analysis or default advice
    toolExecutionLog.push({ name: 'analyze_cv_content', args: { cvText: userMessage } });
    const analysis = await executeCvTool('analyze_cv_content', { cvText: userMessage });
    collectedCvAnalysis = analysis;

    return {
      content: `### 🎯 Đánh Giá Hồ Sơ & Tư Vấn Nghề Nghiệp\n\n` +
        `⭐ **Điểm đánh giá ATS dự kiến:** **${analysis.qualityScore}/10**\n\n` +
        `**1. Điểm mạnh:**\n${analysis.strengths.map((s) => `- ${s}`).join('\n')}\n\n` +
        `**2. Điểm cần tối ưu:**\n${analysis.weaknesses.map((w) => `- ${w}`).join('\n')}\n\n` +
        `**3. Lời khuyên của Career Coach:**\n${analysis.recommendations.map((r) => `- ${r}`).join('\n')}`,
      cvAnalysis: analysis,
      toolCalls: toolExecutionLog,
      agentName: 'CvCareerAgent',
      intent: 'cv_analysis',
    };
  }
}

export default {
  CV_CAREER_SYSTEM_PROMPT,
  runCvCareerAgent,
};
