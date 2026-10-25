import { getGenerativeModel } from '../config/gemini.js';
import config from '../config/env.js';
import { actionToolsDeclarations, executeActionTool } from '../tools/actionTools.js';

export const SYSTEM_ACTION_SYSTEM_PROMPT = `=== VAI TRÒ & NGUYÊN TẮC BẢO MẬT ===
Bạn là PLATFORM ACTION CONTROLLER & SECURITY GUARDIAN — Trợ lý điều hành các tác vụ người dùng trên nền tảng tuyển dụng IT.

=== QUYỀN HẠN TÁC VỤ ===
Bạn được phép thay mặt người dùng thực hiện các hành động:
1. Nộp hồ sơ ứng tuyển việc làm ('apply_job').
2. Lưu việc làm vào danh bạ yêu thích ('bookmark_job') hoặc bỏ lưu ('unbookmark_job').
3. Xem danh sách công việc đã lưu ('get_my_bookmarks').
4. Theo dõi công ty tuyển dụng ('follow_company') hoặc bỏ theo dõi ('unfollow_company').
5. Tra cứu danh sách và tiến độ xét duyệt các đơn ứng tuyển ('get_my_applications').

=== QUY TẮC AN TOÀN BẮT BUỘC (SECURITY RULES) ===
1. QUY TẮC XÁC NHẬN NỘP ĐƠN (Two-Step Confirmation):
   - Nộp đơn ứng tuyển là một hành động quan trọng gửi hồ sơ tới Nhà tuyển dụng.
   - Nếu người dùng chỉ nói: "Nộp đơn vào job 2 đi", bạn phải tóm tắt: "Bạn có chắc chắn muốn nộp đơn vào Công việc #2 không? Hãy xác nhận 'Đồng ý' để tôi gửi hồ sơ." và gọi 'apply_job' với { confirm: false }.
   - CHỈ KHI người dùng đã nói rõ: "Tôi đồng ý nộp đơn", "Xác nhận nộp đơn" hoặc xác nhận rõ ràng thì mới gọi 'apply_job' với { confirm: true }.
2. QUY TẮC XÁC THỰC (Authentication):
   - Nếu API trả về 'requiresAuth: true', hãy thông báo lịch sự rằng người dùng cần đăng nhập tài khoản ứng viên (Seeker) để thực hiện hành động này.
3. PHẢN HỒI RÕ RÀNG:
   - Sau khi hoàn thành hành động (ví dụ: đã bookmark, đã follow, đã nộp đơn), luôn thông báo kết quả cụ thể, rõ ràng kèm ID công việc/công ty.`;

import { sanitizeGeminiHistory } from '../utils/historyHelper.js';

export async function runSystemActionAgent({
  userMessage,
  history = [],
  extraContext = null,
  authToken = null,
  conversationId = null,
}) {
  const toolExecutionLog = [];
  let actionResult = null;

  try {
    const model = getGenerativeModel(config.geminiModel, {
      tools: [{ functionDeclarations: actionToolsDeclarations }],
      systemInstruction: SYSTEM_ACTION_SYSTEM_PROMPT,
    });

    const formattedHistory = sanitizeGeminiHistory(history);
    const chatSession = model.startChat({ history: formattedHistory });
    const prompt = extraContext
      ? `[Ngữ cảnh hệ thống: ${extraContext}]\n\nYêu cầu hành động: ${userMessage}`
      : userMessage;

    let result = await chatSession.sendMessage(prompt);
    let functionCalls = result.response.functionCalls();

    let turns = 0;
    while (functionCalls && functionCalls.length > 0 && turns < 3) {
      turns++;
      const call = functionCalls[0];
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log(`[SystemActionAgent] Calling tool: ${toolName}`, toolArgs);
      toolExecutionLog.push({ name: toolName, args: toolArgs });

      let toolRes = {};
      try {
        toolRes = await executeActionTool(toolName, toolArgs, { authToken, conversationId });
        actionResult = toolRes;
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
      actionResult,
      toolCalls: toolExecutionLog,
      agentName: 'SystemActionAgent',
      intent: 'system_action',
    };
  } catch (err) {
    console.warn('[SystemActionAgent] Gemini execution error, using deterministic action fallback:', err.message);

    const lower = userMessage.toLowerCase();
    const jobMatch = userMessage.match(/(?:job|công việc|việc|id)\s*[:#]?\s*(\d+)/i) || userMessage.match(/\b(\d+)\b/);
    const jobId = jobMatch ? parseInt(jobMatch[1], 10) : 1;

    // 1. Action: Apply Job
    if (lower.includes('nộp đơn') || lower.includes('nop don') || lower.includes('ứng tuyển') || lower.includes('ung tuyen') || lower.includes('apply')) {
      const isConfirmed = lower.includes('xác nhận') || lower.includes('xac nhan') || lower.includes('đồng ý') || lower.includes('dong y') || lower.includes('chắc chắn') || lower.includes('ok');

      if (!isConfirmed) {
        return {
          content: `⚠️ **Xác nhận nộp đơn ứng tuyển:**\n\nBạn có chắc chắn muốn nộp hồ sơ vào **Công việc ID #${jobId}** không?\n\n👉 Vui lòng trả lời: **"Xác nhận nộp đơn công việc ID ${jobId}"** để tôi hoàn tất gửi hồ sơ của bạn tới nhà tuyển dụng nhé!`,
          actionResult: { action: 'apply_job', status: 'pending_confirmation', jobId },
          toolCalls: toolExecutionLog,
          agentName: 'SystemActionAgent',
          intent: 'system_action',
        };
      }

      toolExecutionLog.push({ name: 'apply_job', args: { jobId, confirm: true } });
      const applyRes = await executeActionTool('apply_job', { jobId, confirm: true }, { authToken, conversationId });
      return {
        content: `✅ **Nộp đơn ứng tuyển thành công!**\n\nHồ sơ của bạn đã được chuyển tới nhà tuyển dụng cho vị trí **Công việc #${jobId}**.\n\nBạn có thể kiểm tra trạng thái xét duyệt bất cứ lúc nào bằng cách yêu cầu: *"Xem danh sách đơn đã nộp"*. Chúc bạn ứng tuyển thành công!`,
        actionResult: applyRes,
        toolCalls: toolExecutionLog,
        agentName: 'SystemActionAgent',
        intent: 'system_action',
      };
    }

    // 2. Action: Bookmark Job
    if (lower.includes('lưu') || lower.includes('luu') || lower.includes('bookmark')) {
      if (lower.includes('bỏ lưu') || lower.includes('bo luu') || lower.includes('xóa lưu')) {
        toolExecutionLog.push({ name: 'unbookmark_job', args: { jobId } });
        const unbookmarkRes = await executeActionTool('unbookmark_job', { jobId }, { authToken, conversationId });
        return {
          content: `🗑️ **Đã bỏ lưu công việc:** Công việc **ID #${jobId}** đã được xóa khỏi danh bạ việc làm yêu thích của bạn.`,
          actionResult: unbookmarkRes,
          toolCalls: toolExecutionLog,
          agentName: 'SystemActionAgent',
          intent: 'system_action',
        };
      }

      toolExecutionLog.push({ name: 'bookmark_job', args: { jobId } });
      const bookmarkRes = await executeActionTool('bookmark_job', { jobId }, { authToken, conversationId });
      return {
        content: `⭐ **Đã lưu công việc thành công!**\n\nCông việc **ID #${jobId}** đã được lưu vào danh sách yêu thích của bạn. Bạn có thể xem lại bất kỳ lúc nào để chuẩn bị hồ sơ ứng tuyển tốt nhất.`,
        actionResult: bookmarkRes,
        toolCalls: toolExecutionLog,
        agentName: 'SystemActionAgent',
        intent: 'system_action',
      };
    }

    // 3. Action: Get my applications
    if (lower.includes('đơn đã nộp') || lower.includes('don da nop') || lower.includes('danh sách ứng tuyển') || lower.includes('lich su')) {
      toolExecutionLog.push({ name: 'get_my_applications', args: {} });
      const appRes = await executeActionTool('get_my_applications', {}, { authToken, conversationId });
      return {
        content: `📋 **Danh Sách Đơn Ứng Tuyển Của Bạn:**\n\n${appRes.summary || 'Bạn hiện có các hồ sơ đang trong quá trình xét duyệt.'}\n\n*Hệ thống sẽ gửi thông báo ngay khi nhà tuyển dụng phản hồi hồ sơ của bạn.*`,
        actionResult: appRes,
        toolCalls: toolExecutionLog,
        agentName: 'SystemActionAgent',
        intent: 'system_action',
      };
    }

    // Default action response
    return {
      content: `⚡ **Thao tác hệ thống:** Tôi đã tiếp nhận yêu cầu "${userMessage}". Nếu cần hỗ trợ nộp đơn, lưu việc làm hoặc theo dõi công ty, hãy cho tôi biết rõ mã ID nhé!`,
      actionResult: { received: true },
      toolCalls: toolExecutionLog,
      agentName: 'SystemActionAgent',
      intent: 'system_action',
    };
  }
}

export default {
  SYSTEM_ACTION_SYSTEM_PROMPT,
  runSystemActionAgent,
};
