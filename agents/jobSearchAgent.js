import { getGenerativeModel } from '../config/gemini.js';
import config from '../config/env.js';
import { jobToolsDeclarations, executeJobTool } from '../tools/jobTools.js';

export const JOB_SEARCH_SYSTEM_PROMPT = `=== VAI TRÒ & CHUYÊN MÔN ===
Bạn là JOB SEARCH SPECIALIST & MARKET ADVISOR — Chuyên gia hàng đầu về tìm kiếm cơ hội việc làm IT và phân tích thị trường tuyển dụng.

=== MỤC TIÊU CỐT LÕI ===
1. Khai thác chính xác mong muốn của ứng viên: Vị trí (chức danh), cấp bậc (Intern, Fresher, Junior, Senior, Lead), kỹ năng chuyên môn (React, Node, Python, Java...), địa điểm (Hà Nội, TP.HCM, Đà Nẵng, Remote, Hybrid), và khoảng lương mong muốn.
2. Tận dụng triệt để các công cụ:
   - 'search_jobs': Khi người dùng tìm kiếm việc làm có từ khóa, ngành nghề, địa điểm hoặc mức lương.
   - 'get_latest_jobs': Khi người dùng muốn xem các cơ hội việc làm mới nhất vừa đăng tải.
   - 'recommend_jobs': Khi người dùng cung cấp danh sách kỹ năng hoặc hồ sơ và muốn gợi ý công việc phù hợp nhất.
3. Phân tích thị trường thực tế: Đánh giá mức độ cạnh tranh của vị trí, mặt bằng lương hiện nay.

=== NGUYÊN TẮC NGHIÊM NGẶT ===
1. CHỈ sử dụng dữ liệu thực tế được trả về từ các Tools hệ thống.
2. TUYỆT ĐỐI KHÔNG tự nghĩ ra, bịa đặt tên công ty, mức lương, hoặc tin tuyển dụng không tồn tại.
3. Nếu không tìm thấy công việc chính xác theo yêu cầu, hãy thông báo lịch sự và đề xuất mở rộng từ khóa, địa điểm hoặc kỹ năng liên quan.

=== ĐỊNH DẠNG CÂU TRẢ LỜI ===
Luôn trình bày bằng Tiếng Việt rõ ràng, dùng gạch đầu dòng và in đậm điểm nổi bật:
**Tìm thấy X công việc phù hợp với yêu cầu của bạn:**
1. **[Tên Vị trí]** tại **[Tên Công ty]**
   - 💰 Mức lương: [Lương]
   - 📍 Địa điểm: [Địa điểm & Hình thức]
   - 🛠️ Kỹ năng chính: [Skills nổi bật]
   - 💡 Tóm tắt yêu cầu: [Mô tả ngắn gọn]
   - 🔗 Chi tiết: [URL]

Cuối câu trả lời, hãy gợi ý bước tiếp theo hữu ích: "Bạn có muốn xem chi tiết công việc nào hoặc để tôi phân tích CV của bạn so với vị trí này không?"`;

import { sanitizeGeminiHistory } from '../utils/historyHelper.js';

export async function runJobSearchAgent({
  userMessage,
  history = [],
  extraContext = null,
  authToken = null,
  conversationId = null,
}) {
  const toolExecutionLog = [];
  let collectedJobs = [];

  try {
    const model = getGenerativeModel(config.geminiModel, {
      tools: [{ functionDeclarations: jobToolsDeclarations }],
      systemInstruction: JOB_SEARCH_SYSTEM_PROMPT,
    });

    const formattedHistory = sanitizeGeminiHistory(history);
    const chatSession = model.startChat({ history: formattedHistory });
    const prompt = extraContext
      ? `[Ngữ cảnh bổ sung: ${extraContext}]\n\nYêu cầu tìm việc: ${userMessage}`
      : userMessage;

    let result = await chatSession.sendMessage(prompt);
    let functionCalls = result.response.functionCalls();

    let turns = 0;
    while (functionCalls && functionCalls.length > 0 && turns < 3) {
      turns++;
      const call = functionCalls[0];
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log(`[JobSearchAgent] Calling tool: ${toolName}`, toolArgs);
      toolExecutionLog.push({ name: toolName, args: toolArgs });

      let toolRes = {};
      try {
        toolRes = await executeJobTool(toolName, toolArgs, { authToken, conversationId });
        if (toolRes.jobs && Array.isArray(toolRes.jobs)) {
          collectedJobs = toolRes.jobs;
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
      jobs: collectedJobs,
      toolCalls: toolExecutionLog,
      agentName: 'JobSearchAgent',
      intent: 'jobs_search',
    };
  } catch (err) {
    console.warn('[JobSearchAgent] Gemini execution error, using deterministic job search fallback:', err.message);

    // Extract query & location from user message
    const lower = userMessage.toLowerCase();
    let query = '';
    const techKeywords = ['react', 'node', 'python', 'java', 'frontend', 'backend', 'fullstack', 'tester', 'qa', 'devops', 'c#', 'c++', 'golang', 'php', 'intern', 'fresher', 'junior', 'senior'];
    for (const kw of techKeywords) {
      if (lower.includes(kw)) {
        query = kw.toUpperCase();
        break;
      }
    }

    let location = 'Toàn quốc';
    if (lower.includes('hà nội') || lower.includes('ha noi')) location = 'Hà Nội';
    else if (lower.includes('hồ chí minh') || lower.includes('hcm') || lower.includes('sài gòn')) location = 'Hồ Chí Minh';
    else if (lower.includes('đà nẵng') || lower.includes('da nang')) location = 'Đà Nẵng';
    else if (lower.includes('remote') || lower.includes('từ xa')) location = 'Remote';

    toolExecutionLog.push({ name: 'search_jobs', args: { query, location } });
    const toolRes = await executeJobTool('search_jobs', { query, location }, { authToken, conversationId });
    collectedJobs = toolRes.jobs || [];

    const jobLines = collectedJobs.map((j, i) =>
      `${i + 1}. **${j.title}** tại **${j.company}**\n   - 💰 Lương: **${j.salary}**\n   - 📍 Địa điểm: ${j.location}\n   - 🛠️ Kỹ năng: ${(j.skills || []).slice(0, 4).join(', ') || 'Chuyên môn'}`
    ).join('\n\n');

    const formattedContent = [
      `### 💼 Tìm Thấy ${collectedJobs.length} Cơ Hội Việc Làm Phù Hợp:`,
      query ? `*Từ khóa tìm kiếm: **${query}** tại khu vực **${location}***\n` : '',
      jobLines,
      '',
      '---',
      '💡 *Bạn có thể bấm **Chi tiết** để xem yêu cầu cụ thể, **⭐ Lưu** hoặc **Nộp đơn** ứng tuyển ngay!*',
    ].filter(Boolean).join('\n');

    return {
      content: formattedContent,
      jobs: collectedJobs,
      toolCalls: toolExecutionLog,
      agentName: 'JobSearchAgent',
      intent: 'jobs_search',
    };
  }
}

export default {
  JOB_SEARCH_SYSTEM_PROMPT,
  runJobSearchAgent,
};
