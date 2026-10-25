import { getGenerativeModel } from '../config/gemini.js';
import config from '../config/env.js';
import { qaToolsDeclarations, executeQaTool } from '../tools/qaTools.js';

export const SYSTEM_QA_SYSTEM_PROMPT = `=== VAI TRÒ & CHUYÊN MÔN ===
Bạn là ENTERPRISE INFORMATION & PLATFORM HELP DESK — Chuyên viên cung cấp thông tin doanh nghiệp, tin tuyển dụng chi tiết và giải đáp hỗ trợ nền tảng tuyển dụng IT.

=== NHIỆM VỤ CỐT LÕI ===
1. Cung cấp chi tiết công việc:
   - Khi người dùng hỏi về một công việc cụ thể (theo Job ID): Hãy gọi ngay 'get_job_detail'.
   - Trình bày đầy đủ: Tiêu đề, Tên công ty, Địa điểm làm việc, Mức lương, Mô tả công việc, Yêu cầu ứng viên và Quyền lợi được hưởng.
2. Cung cấp thông tin công ty / nhà tuyển dụng:
   - Khi người dùng hỏi về một công ty: Gọi 'get_company_detail' để tra cứu quy mô, địa chỉ, website, lĩnh vực hoạt động.
   - Khi người dùng muốn xem các vị trí công ty đó đang tuyển: Gọi 'get_company_jobs'.
   - Tra cứu danh sách doanh nghiệp: Gọi 'get_all_companies'.
3. Giải đáp chính sách nền tảng (FAQ):
   - Gọi 'platform_faq' khi người dùng có thắc mắc về quy trình nộp hồ sơ, bảo mật thông tin, cách liên hệ nhà tuyển dụng.

=== NGUYÊN TẮC TRẢ LỜI ===
1. Khách quan, chuẩn xác, đầy đủ thông tin.
2. Sử dụng Tiếng Việt trang nhã, phân chia các đề mục rõ ràng (Tiêu đề, Địa điểm, Yêu cầu, Quyền lợi).
3. Luôn đính kèm đường link chi tiết hoặc gợi ý: "Bạn có muốn nộp đơn ứng tuyển hoặc xem thêm các vị trí khác của công ty này không?"`;

import { sanitizeGeminiHistory } from '../utils/historyHelper.js';

export async function runSystemQaAgent({
  userMessage,
  history = [],
  extraContext = null,
  authToken = null,
  conversationId = null,
}) {
  const toolExecutionLog = [];
  let qaResult = null;

  try {
    const model = getGenerativeModel(config.geminiModel, {
      tools: [{ functionDeclarations: qaToolsDeclarations }],
      systemInstruction: SYSTEM_QA_SYSTEM_PROMPT,
    });

    const formattedHistory = sanitizeGeminiHistory(history);
    const chatSession = model.startChat({ history: formattedHistory });
    const prompt = extraContext
      ? `[Ngữ cảnh hệ thống: ${extraContext}]\n\nCâu hỏi tra cứu: ${userMessage}`
      : userMessage;

    let result = await chatSession.sendMessage(prompt);
    let functionCalls = result.response.functionCalls();

    let turns = 0;
    while (functionCalls && functionCalls.length > 0 && turns < 3) {
      turns++;
      const call = functionCalls[0];
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log(`[SystemQaAgent] Calling tool: ${toolName}`, toolArgs);
      toolExecutionLog.push({ name: toolName, args: toolArgs });

      let toolRes = {};
      try {
        toolRes = await executeQaTool(toolName, toolArgs, { authToken, conversationId });
        qaResult = toolRes;
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
      qaResult,
      toolCalls: toolExecutionLog,
      agentName: 'SystemQaAgent',
      intent: 'qa_info',
    };
  } catch (err) {
    console.warn('[SystemQaAgent] Gemini execution error, using deterministic tool fallback:', err.message);

    // Extract Job ID if user asks about a job
    const jobMatch = userMessage.match(/(?:job|công việc|việc|id)\s*[:#]?\s*(\d+)/i) || userMessage.match(/\b(\d+)\b/);
    if (jobMatch) {
      const jobId = parseInt(jobMatch[1], 10);
      toolExecutionLog.push({ name: 'get_job_detail', args: { jobId } });
      const job = await executeQaTool('get_job_detail', { jobId }, { authToken, conversationId });

      const reqList = Array.isArray(job.requirements)
        ? job.requirements.map((r) => `- ${r}`).join('\n')
        : (job.requirements ? `- ${job.requirements}` : '- Trao đổi cụ thể khi phỏng vấn.');

      const formattedContent = [
        `### 📌 Chi tiết công việc: **${job.title}** (Mã: #${job.id})`,
        '',
        `🏢 **Công ty:** **${job.company}**`,
        `📍 **Địa điểm làm việc:** ${job.location}`,
        `💰 **Mức lương:** **${job.salary}** — *${job.jobType || 'Toàn thời gian'}*`,
        job.category ? `🏷️ **Ngành nghề:** ${job.category}` : '',
        '',
        '#### 📝 Mô tả công việc:',
        job.description || 'Chưa cập nhật bản mô tả chi tiết.',
        '',
        '#### 🎯 Yêu cầu ứng viên:',
        reqList,
        '',
        '#### 🎁 Quyền lợi được hưởng:',
        job.benefits || 'Đầy đủ quyền lợi và chế độ đãi ngộ theo quy định.',
        '',
        '---',
        `💡 *Bạn có thể bấm **Nộp đơn** hoặc gửi tin nhắn *"Nộp đơn ứng tuyển công việc ID ${job.id}"* để tôi hỗ trợ gửi hồ sơ ngay!*`,
      ].filter(Boolean).join('\n');

      return {
        content: formattedContent,
        qaResult: job,
        toolCalls: toolExecutionLog,
        agentName: 'SystemQaAgent',
        intent: 'qa_info',
      };
    }

    // FAQ check
    const faqToolRes = await executeQaTool('platform_faq', { topic: userMessage });
    return {
      content: `### ℹ️ Hỗ Trợ & Giải Đáp Nền Tảng\n\n${faqToolRes.answer}\n\n*Nếu bạn cần tra cứu công việc hoặc công ty cụ thể, hãy cung cấp mã Job ID hoặc tên công ty nhé!*`,
      qaResult: faqToolRes,
      toolCalls: toolExecutionLog,
      agentName: 'SystemQaAgent',
      intent: 'qa_info',
    };
  }
}

export default {
  SYSTEM_QA_SYSTEM_PROMPT,
  runSystemQaAgent,
};
