import backendClient from '../services/backendClient.js';

export const actionToolsDeclarations = [
  {
    name: 'apply_job',
    description: 'Thực hiện nộp đơn ứng tuyển vào một vị trí tuyển dụng trên hệ thống. (Yêu cầu tài khoản ứng viên đã đăng nhập).',
    parameters: {
      type: 'OBJECT',
      properties: {
        jobId: {
          type: 'NUMBER',
          description: 'ID của công việc muốn ứng tuyển.',
        },
        coverLetter: {
          type: 'STRING',
          description: 'Thư giới thiệu / tin nhắn ngắn gửi tới nhà tuyển dụng (tùy chọn).',
        },
        cvId: {
          type: 'NUMBER',
          description: 'ID của hồ sơ CV đã lưu trên hệ thống muốn dùng để nộp (tùy chọn).',
        },
        confirm: {
          type: 'BOOLEAN',
          description: 'Người dùng đã xác nhận đồng ý nộp đơn (true) hay chưa (false). Nếu chưa xác nhận, hệ thống sẽ hỏi lại.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'bookmark_job',
    description: 'Lưu một công việc vào danh sách việc làm yêu thích để xem lại sau.',
    parameters: {
      type: 'OBJECT',
      properties: {
        jobId: {
          type: 'NUMBER',
          description: 'ID của công việc cần lưu.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'unbookmark_job',
    description: 'Hủy lưu một công việc khỏi danh sách việc làm yêu thích.',
    parameters: {
      type: 'OBJECT',
      properties: {
        jobId: {
          type: 'NUMBER',
          description: 'ID của công việc cần bỏ lưu.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_my_bookmarks',
    description: 'Xem danh sách các công việc mà người dùng đã lưu/bookmark.',
    parameters: {
      type: 'OBJECT',
      properties: {
        page: { type: 'NUMBER', description: 'Số trang (mặc định 1)' },
        limit: { type: 'NUMBER', description: 'Số lượng mục hiển thị (mặc định 10)' },
      },
    },
  },
  {
    name: 'follow_company',
    description: 'Bấm theo dõi (Follow) một công ty để nhận thông báo về các tin tuyển dụng mới nhất của công ty đó.',
    parameters: {
      type: 'OBJECT',
      properties: {
        companyId: {
          type: 'NUMBER',
          description: 'ID của công ty cần theo dõi.',
        },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'unfollow_company',
    description: 'Hủy theo dõi một công ty tuyển dụng.',
    parameters: {
      type: 'OBJECT',
      properties: {
        companyId: {
          type: 'NUMBER',
          description: 'ID của công ty cần bỏ theo dõi.',
        },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'get_my_applications',
    description: 'Tra cứu danh sách các công việc mà ứng viên đã từng nộp đơn ứng tuyển và trạng thái xét duyệt hiện tại.',
    parameters: {
      type: 'OBJECT',
      properties: {
        page: { type: 'NUMBER', description: 'Số trang' },
        limit: { type: 'NUMBER', description: 'Số lượng' },
        status: {
          type: 'STRING',
          description: 'Lọc theo trạng thái (ví dụ: "PENDING", "ACCEPTED", "REJECTED", "INTERVIEW").',
        },
      },
    },
  },
];

export async function executeActionTool(name, args = {}, context = {}) {
  const token = context.authToken || null;

  switch (name) {
    case 'apply_job': {
      if (!args.confirm) {
        return {
          status: 'pending_confirmation',
          jobId: args.jobId,
          message: `Bạn có chắc chắn muốn nộp đơn ứng tuyển vào Công việc #${args.jobId} không? Hãy xác nhận để tôi tiến hành gửi hồ sơ.`,
          requiresConfirmation: true,
        };
      }

      const res = await backendClient.applyJob({
        jobId: args.jobId,
        cvId: args.cvId,
        coverLetter: args.coverLetter,
      }, token);

      return res;
    }

    case 'bookmark_job': {
      const res = await backendClient.bookmarkJob(args.jobId, token);
      return res;
    }

    case 'unbookmark_job': {
      const res = await backendClient.unbookmarkJob(args.jobId, token);
      return res;
    }

    case 'get_my_bookmarks': {
      const res = await backendClient.getMyBookmarks(args, token);
      const items = Array.isArray(res) ? res : (res.data || res.items || []);
      return {
        total: items.length,
        items,
        summary: `Bạn hiện có ${items.length} công việc đã lưu trong danh bạ yêu thích.`,
      };
    }

    case 'follow_company': {
      const res = await backendClient.followCompany(args.companyId, token);
      return res;
    }

    case 'unfollow_company': {
      const res = await backendClient.unfollowCompany(args.companyId, token);
      return res;
    }

    case 'get_my_applications': {
      const res = await backendClient.getMyApplications(args, token);
      const items = Array.isArray(res) ? res : (res.data || res.items || []);
      return {
        total: items.length,
        items,
        summary: `Bạn đã nộp đơn vào ${items.length} vị trí tuyển dụng.`,
      };
    }

    default:
      throw new Error(`Unknown action tool: ${name}`);
  }
}
