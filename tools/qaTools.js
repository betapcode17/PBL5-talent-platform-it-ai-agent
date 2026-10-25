import backendClient from '../services/backendClient.js';

export const qaToolsDeclarations = [
  {
    name: 'get_job_detail',
    description: 'Tra cứu thông tin chi tiết đầy đủ của một công việc theo Job ID: tiêu đề, tên công ty, mô tả công việc, các yêu cầu ứng viên, quyền lợi và mức lương.',
    parameters: {
      type: 'OBJECT',
      properties: {
        jobId: {
          type: 'NUMBER',
          description: 'Mã ID của công việc cần tra cứu (ví dụ: 1, 2, 5).',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'get_company_detail',
    description: 'Lấy thông tin giới thiệu chi tiết về một công ty: quy mô nhân sự, trụ sở, lĩnh vực hoạt động, website và mô tả công ty.',
    parameters: {
      type: 'OBJECT',
      properties: {
        companyId: {
          type: 'NUMBER',
          description: 'Mã ID của công ty cần tra cứu.',
        },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'get_company_jobs',
    description: 'Lấy danh sách tất cả các vị trí công việc đang mở tuyển dụng của một công ty cụ thể.',
    parameters: {
      type: 'OBJECT',
      properties: {
        companyId: {
          type: 'NUMBER',
          description: 'Mã ID của công ty tuyển dụng.',
        },
        page: { type: 'NUMBER', description: 'Trang kết quả (mặc định: 1)' },
        limit: { type: 'NUMBER', description: 'Số lượng việc làm (mặc định: 10)' },
      },
      required: ['companyId'],
    },
  },
  {
    name: 'get_all_companies',
    description: 'Tra cứu danh sách các công ty, doanh nghiệp đang tuyển dụng trên nền tảng.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Tên công ty hoặc từ khóa tìm kiếm (ví dụ: "FPT", "VNG", "Viettel").',
        },
        page: { type: 'NUMBER', description: 'Số trang' },
        limit: { type: 'NUMBER', description: 'Số lượng' },
      },
    },
  },
  {
    name: 'platform_faq',
    description: 'Giải đáp các câu hỏi thường gặp về nền tảng: quy trình nộp hồ sơ, bảo mật thông tin, cách cập nhật hồ sơ, liên hệ hỗ trợ.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: {
          type: 'STRING',
          description: 'Chủ đề người dùng thắc mắc (ví dụ: "quy trình ứng tuyển", "tạo CV", "liên hệ nhà tuyển dụng").',
        },
      },
      required: ['topic'],
    },
  },
];

export async function executeQaTool(name, args = {}, context = {}) {
  switch (name) {
    case 'get_job_detail': {
      const res = await backendClient.getJobDetail(args.jobId);
      if (res.error) {
        return { success: false, message: res.error };
      }

      return {
        id: res.id,
        title: res.title,
        company: res.company?.name || 'Công ty tuyển dụng',
        location: res.location || res.workLocation || 'Chưa cập nhật',
        salary: res.salaryRange || 'Thỏa thuận',
        jobType: res.jobType?.name || 'Toàn thời gian',
        category: res.category?.name || 'Chung',
        description: res.description || '',
        requirements: Array.isArray(res.requirements) ? res.requirements : (res.requirements || ''),
        benefits: res.benefits || 'Được hưởng đầy đủ chế độ BHXH, thưởng lễ tết theo quy định.',
        deadline: res.deadline || 'Đang mở tuyển',
        url: `/jobs/${res.id}`,
      };
    }

    case 'get_company_detail': {
      const res = await backendClient.getCompanyDetail(args.companyId);
      if (res.error) {
        return { success: false, message: res.error };
      }

      return {
        id: res.id,
        name: res.name,
        industry: res.industry || res.field || 'Công nghệ thông tin',
        size: res.size || res.employeeCount || 'Quy mô chưa cập nhật',
        address: res.address || res.location || 'Chưa cập nhật',
        website: res.website || '#',
        description: res.description || 'Chưa có bài giới thiệu chi tiết.',
      };
    }

    case 'get_company_jobs': {
      const res = await backendClient.getCompanyJobs(args.companyId, {
        page: args.page || 1,
        limit: args.limit || 10,
      });

      const raw = Array.isArray(res) ? res : (res.data || res.items || []);
      const jobs = raw.map((j) => ({
        id: j.id,
        title: j.title,
        location: j.location,
        salary: j.salaryRange || 'Thỏa thuận',
        url: `/jobs/${j.id}`,
      }));

      return {
        companyId: args.companyId,
        total: jobs.length,
        jobs,
        summary: `Công ty #${args.companyId} hiện đang tuyển dụng ${jobs.length} vị trí công việc.`,
      };
    }

    case 'get_all_companies': {
      const res = await backendClient.getAllCompanies({
        q: args.query,
        page: args.page || 1,
        limit: args.limit || 10,
      });

      const raw = Array.isArray(res) ? res : (res.data || res.items || []);
      const companies = raw.map((c) => ({
        id: c.id,
        name: c.name,
        industry: c.industry || 'IT / Phần mềm',
        address: c.address || c.location,
        url: `/companies/${c.id}`,
      }));

      return {
        total: companies.length,
        companies,
        summary: `Tìm thấy ${companies.length} công ty trên hệ thống.`,
      };
    }

    case 'platform_faq': {
      const topicLower = (args.topic || '').toLowerCase();
      let answer = 'Nền tảng tuyển dụng việc làm IT hỗ trợ tìm kiếm công việc, nộp hồ sơ trực tuyến, phân tích CV tự động và kết nối trực tiếp với các nhà tuyển dụng hàng đầu.';

      if (topicLower.includes('ứng tuyển') || topicLower.includes('ung tuyen') || topicLower.includes('apply')) {
        answer = 'Để ứng tuyển, bạn chỉ cần tìm việc làm mong muốn, nhấn nút "Ứng tuyển ngay" (hoặc yêu cầu trợ lý AI nộp đơn giúp bạn), chọn CV đã lưu hoặc tải CV mới từ máy tính.';
      } else if (topicLower.includes('cv') || topicLower.includes('hồ sơ') || topicLower.includes('ho so')) {
        answer = 'Bạn có thể tải lên file CV định dạng PDF để trợ lý AI bóc tách kỹ năng, chấm điểm chất lượng và so sánh độ phù hợp với các tin tuyển dụng.';
      } else if (topicLower.includes('bookmark') || topicLower.includes('lưu') || topicLower.includes('luu')) {
        answer = 'Bạn có thể bấm biểu tượng Lưu (Bookmark) tại bất kỳ công việc nào hoặc yêu cầu AI "Lưu job này lại" để tiện theo dõi và nộp sau.';
      }

      return {
        topic: args.topic,
        answer,
      };
    }

    default:
      throw new Error(`Unknown QA tool: ${name}`);
  }
}
