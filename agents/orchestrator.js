import config from '../config/env.js';
import conversationStore from '../services/conversationStore.js';
import { runJobSearchAgent } from './jobSearchAgent.js';
import { runCvCareerAgent } from './cvCareerAgent.js';
import { runSystemActionAgent } from './systemActionAgent.js';
import { runSystemQaAgent } from './systemQaAgent.js';

export class MultiAgentOrchestrator {
  constructor() {
    this.modelName = config.geminiModel;
  }

  /**
   * Router: Phân loại ý định người dùng để ủy quyền cho Sub-Agent có System Prompt tương ứng
   */
  classifyIntent(userMessage = '') {
    const text = userMessage.toLowerCase().trim();

    // 0. Nếu là câu hỏi hướng dẫn, quy trình, cách thức -> Ưu tiên chuyển về Nhóm D (FAQ / Tra cứu)
    const isQuestionAboutProcess = /quy trình|hướng dẫn|cách|như thế nào|thế nào|làm sao|faq|chính sách|hỏi về/i.test(text);
    if (isQuestionAboutProcess) {
      return 'SYSTEM_QA';
    }

    // 1. Nhóm C: Hành động hệ thống (Ưu tiên cao nhất nếu có từ khóa hành động rõ ràng)
    const actionKeywords = [
      'nộp đơn', 'nop don', 'ứng tuyển', 'ung tuyen', 'apply', 'gửi hồ sơ', 'gui ho so',
      'lưu lại', 'luu lai', 'lưu việc', 'luu viec', 'lưu công việc', 'luu cong viec', 'bookmark', 'bỏ lưu', 'bo luu', 'xóa lưu',
      'theo dõi', 'follow', 'unfollow', 'hủy theo dõi', 'bỏ theo dõi',
      'đơn đã nộp', 'việc đã lưu', 'danh sách ứng tuyển', 'xác nhận nộp', 'xác nhận ứng tuyển',
    ];
    if (actionKeywords.some((kw) => text.includes(kw)) || /^(?:lưu|bookmark|apply)\b/i.test(text)) {
      return 'SYSTEM_ACTION';
    }

    // 2. Nhóm B: CV và Tư vấn nghề nghiệp
    const cvKeywords = [
      'cv', 'hồ sơ', 'ho so', 'resume', 'lộ trình', 'lo trinh', 'roadmap',
      'phân tích cv', 'chấm điểm cv', 'sửa cv', 'cải thiện cv', 'so khớp',
      'skills gap', 'kỹ năng thiếu', 'career', 'lên senior', 'lên lead', 'định hướng nghề',
    ];
    if (cvKeywords.some((kw) => text.includes(kw))) {
      return 'CV_CAREER';
    }

    // 3. Nhóm D: Tra cứu chi tiết Job / Company & FAQ
    const qaKeywords = [
      'chi tiết', 'chi tiet', 'xem chi tiết', 'xem công việc', 'thông tin job', 'thông tin công việc',
      'thông tin công ty', 'công ty fpt', 'công ty vng', 'công ty viettel',
      'công ty này tuyển gì', 'chính sách', 'quy trình', 'hướng dẫn', 'faq', 'giới thiệu',
    ];
    if (qaKeywords.some((kw) => text.includes(kw)) || /\b(?:job|công việc|việc|id)\s*[:#]?\s*\d+\b/i.test(text)) {
      return 'SYSTEM_QA';
    }

    // 4. Nhóm A: Tìm kiếm việc làm
    const jobKeywords = [
      'tìm việc', 'tim viec', 'job', 'tuyển dụng', 'tuyen dung', 'việc làm', 'viec lam',
      'lương', 'salary', 'hà nội', 'hcm', 'đà nẵng', 'remote', 'hybrid',
      'react', 'node', 'python', 'java', 'frontend', 'backend', 'fullstack',
      'tester', 'qa', 'devops', 'intern', 'fresher', 'junior', 'senior',
    ];
    if (jobKeywords.some((kw) => text.includes(kw))) {
      return 'JOB_SEARCH';
    }

    return 'GENERAL';
  }

  /**
   * Main chat function routing to dedicated Sub-Agent
   */
  async chat({
    userMessage,
    conversationId,
    extraContext = null,
    authToken = null,
  }) {
    const history = await conversationStore.getRecentHistory(conversationId, 6);
    const intentCategory = this.classifyIntent(userMessage);

    console.log(`[Orchestrator] Routed message to Sub-Agent category: ${intentCategory}`);

    let agentResponse = null;
    let detectedIntent = 'general_chat';
    let collectedJobs = [];
    let collectedCvResult = null;
    let toolExecutionLog = [];

    try {
      switch (intentCategory) {
        case 'JOB_SEARCH': {
          agentResponse = await runJobSearchAgent({
            userMessage,
            history,
            extraContext,
            authToken,
            conversationId,
          });
          detectedIntent = 'jobs_search';
          collectedJobs = agentResponse.jobs || [];
          toolExecutionLog = agentResponse.toolCalls || [];
          break;
        }

        case 'CV_CAREER': {
          agentResponse = await runCvCareerAgent({
            userMessage,
            history,
            extraContext,
            authToken,
            conversationId,
          });
          detectedIntent = 'cv_analysis';
          collectedCvResult = agentResponse.cvAnalysis || null;
          toolExecutionLog = agentResponse.toolCalls || [];
          break;
        }

        case 'SYSTEM_ACTION': {
          agentResponse = await runSystemActionAgent({
            userMessage,
            history,
            extraContext,
            authToken,
            conversationId,
          });
          detectedIntent = 'system_action';
          toolExecutionLog = agentResponse.toolCalls || [];
          break;
        }

        case 'SYSTEM_QA': {
          agentResponse = await runSystemQaAgent({
            userMessage,
            history,
            extraContext,
            authToken,
            conversationId,
          });
          detectedIntent = 'qa_info';
          toolExecutionLog = agentResponse.toolCalls || [];
          break;
        }

        default: {
          // General friendly guidance with Job Search capability
          agentResponse = await runJobSearchAgent({
            userMessage,
            history,
            extraContext,
            authToken,
            conversationId,
          });
          detectedIntent = 'general_chat';
          collectedJobs = agentResponse.jobs || [];
          toolExecutionLog = agentResponse.toolCalls || [];
          break;
        }
      }
    } catch (err) {
      console.error(`[Orchestrator] Error executing ${intentCategory} Sub-Agent:`, err.message);
      agentResponse = {
        content: `Tôi đã tiếp nhận yêu cầu "${userMessage}". Hiện tại hệ thống đang đồng bộ dữ liệu. Bạn có thể thử lại bằng cách nêu rõ mã Job ID hoặc kỹ năng công nghệ cần tìm kiếm nhé!`,
      };
    }

    const finalAnswer = agentResponse.content || '';
    const totalJobsFound = collectedJobs.length;
    let jobsSummary = null;

    if (totalJobsFound > 0) {
      const topJob = collectedJobs[0];
      const heading = [topJob.title, topJob.company].filter(Boolean).join(' | ');
      jobsSummary = `Tôi tìm được ${totalJobsFound} công việc phù hợp. Nổi bật nhất là ${heading}.`;
    }

    // Save assistant message to conversation store
    const assistantMsg = await conversationStore.addMessage({
      conversationId,
      role: 'assistant',
      content: finalAnswer,
      messageType: collectedJobs.length ? 'job_answer' : (collectedCvResult ? 'cv_result' : 'general_answer'),
      detectedIntent,
      sources: collectedJobs.map((j) => ({
        entityType: 'job',
        sourceId: j.id,
        title: j.title,
        company: j.company,
        url: j.url,
      })),
      jobResults: collectedJobs,
      jobResultsTotal: totalJobsFound,
      jobResultsSummary: jobsSummary,
      cvAnalysis: collectedCvResult,
      toolCalls: toolExecutionLog,
    });

    return {
      success: true,
      version: '3.1.0-multi-agent-specialized',
      conversationId,
      subAgent: agentResponse.agentName || 'MasterOrchestrator',
      message: assistantMsg,
      data: {
        intent: detectedIntent,
        jobs: collectedJobs,
        total: totalJobsFound,
        totalJobsFound,
        jobSearch: totalJobsFound > 0 ? {
          summary: jobsSummary,
          total: totalJobsFound,
          itemsCount: collectedJobs.length,
        } : null,
      },
      structured: collectedJobs.length > 0 ? {
        type: 'jobs',
        items: collectedJobs,
        total: totalJobsFound,
        summary: jobsSummary,
      } : null,
    };
  }

  /**
   * Stream chat function for SSE
   */
  async *chatStream({
    userMessage,
    conversationId,
    extraContext = null,
    authToken = null,
  }) {
    const category = this.classifyIntent(userMessage);
    const subAgentNames = {
      JOB_SEARCH: 'JobSearchAgent (Nhóm A)',
      CV_CAREER: 'CvCareerAgent (Nhóm B)',
      SYSTEM_ACTION: 'SystemActionAgent (Nhóm C)',
      SYSTEM_QA: 'SystemQaAgent (Nhóm D)',
      GENERAL: 'MasterOrchestrator',
    };

    yield {
      type: 'status',
      stage: 'routing',
      message: `Đang ủy quyền cho ${subAgentNames[category] || 'Trợ lý AI'} xử lý...`,
    };

    const result = await this.chat({
      userMessage,
      conversationId,
      extraContext,
      authToken,
    });

    yield {
      type: 'status',
      stage: 'answering',
      message: 'Đang tạo câu trả lời chuyên sâu...',
    };

    const content = result.message?.content || '';
    const chunkSize = 25;
    for (let i = 0; i < content.length; i += chunkSize) {
      const delta = content.slice(i, i + chunkSize);
      yield { type: 'chunk', delta };
      await new Promise((r) => setTimeout(r, 20));
    }

    yield {
      type: 'final',
      payload: result,
    };
  }
}

export const orchestrator = new MultiAgentOrchestrator();
export default orchestrator;
