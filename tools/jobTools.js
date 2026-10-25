import backendClient from '../services/backendClient.js';

export const jobToolsDeclarations = [
  {
    name: 'search_jobs',
    description: 'Tìm kiếm danh sách công việc phù hợp trên hệ thống dựa theo từ khóa, kỹ năng, địa điểm, ngành nghề và mức lương.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Từ khóa tìm kiếm (ví dụ: "ReactJS", "Backend", "Python", "Tester", "Intern", "Junior").',
        },
        location: {
          type: 'STRING',
          description: 'Địa điểm làm việc (ví dụ: "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Remote", "Onsite", "Hybrid").',
        },
        category: {
          type: 'STRING',
          description: 'Ngành nghề / danh mục công việc (ví dụ: "Web", "Mobile", "DevOps", "AI", "QA/QC").',
        },
        salaryMin: {
          type: 'STRING',
          description: 'Mức lương tối thiểu mong muốn (ví dụ: "10M", "15000000", "1000 USD").',
        },
        page: {
          type: 'NUMBER',
          description: 'Số trang kết quả (mặc định: 1).',
        },
        limit: {
          type: 'NUMBER',
          description: 'Số lượng việc làm cần lấy (mặc định: 5, tối đa: 15).',
        },
      },
    },
  },
  {
    name: 'get_latest_jobs',
    description: 'Lấy danh sách các công việc mới đăng tuyển gần đây nhất trên nền tảng.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'NUMBER',
          description: 'Số lượng công việc mới nhất cần lấy (mặc định: 5).',
        },
      },
    },
  },
  {
    name: 'recommend_jobs',
    description: 'Gợi ý các công việc phù hợp nhất dựa trên danh sách kỹ năng chuyên môn hoặc kinh nghiệm của ứng viên.',
    parameters: {
      type: 'OBJECT',
      properties: {
        skills: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Danh sách các kỹ năng của ứng viên (ví dụ: ["Python", "Django", "PostgreSQL", "Docker"]).',
        },
        targetRole: {
          type: 'STRING',
          description: 'Vị trí mong muốn ứng tuyển (ví dụ: "Backend Developer", "Frontend Developer", "Data Engineer").',
        },
        location: {
          type: 'STRING',
          description: 'Khu vực mong muốn làm việc (tùy chọn).',
        },
      },
      required: ['skills'],
    },
  },
];

export async function executeJobTool(name, args = {}, context = {}) {
  const token = context.authToken || null;

  switch (name) {
    case 'search_jobs': {
      const res = await backendClient.searchJobs({
        query: args.query,
        location: args.location,
        category: args.category,
        salaryMin: args.salaryMin,
        page: args.page || 1,
        limit: args.limit || 5,
      }, token);

      const rawItems = Array.isArray(res) ? res : (res.data || res.items || []);
      const total = res.total || rawItems.length;

      const jobs = rawItems.map((j) => ({
        id: String(j.id || j._id || ''),
        title: j.title || 'Không có tiêu đề',
        company: j.company?.name || j.companyName || (typeof j.company === 'string' ? j.company : 'Công ty chưa cập nhật'),
        location: j.location || j.workLocation || 'Chưa cập nhật',
        salary: formatSalary(j.salaryRange || j.salary),
        skills: Array.isArray(j.requirements) ? j.requirements : (Array.isArray(j.skills) ? j.skills : []),
        jobType: j.jobType?.name || j.jobType || 'Toàn thời gian',
        url: j.id ? `/jobs/${j.id}` : '#',
        description: (j.description || '').substring(0, 300),
      }));

      return {
        total,
        count: jobs.length,
        jobs,
        summary: `Tìm thấy ${total} công việc phù hợp với yêu cầu.`,
      };
    }

    case 'get_latest_jobs': {
      const limit = args.limit || 5;
      const res = await backendClient.getAllJobs({ page: 1, limit, active: true }, token);
      const rawItems = Array.isArray(res) ? res : (res.data || res.items || []);

      const jobs = rawItems.map((j) => ({
        id: String(j.id || j._id || ''),
        title: j.title,
        company: j.company?.name || j.companyName || 'Công ty tuyển dụng',
        location: j.location || 'Chưa cập nhật',
        salary: formatSalary(j.salaryRange || j.salary),
        skills: Array.isArray(j.requirements) ? j.requirements : [],
        jobType: j.jobType?.name || 'Toàn thời gian',
        url: j.id ? `/jobs/${j.id}` : '#',
      }));

      return {
        total: jobs.length,
        jobs,
        summary: `Danh sách ${jobs.length} công việc mới nhất vừa được đăng tải.`,
      };
    }

    case 'recommend_jobs': {
      const skillsQuery = (args.skills || []).join(' ');
      const query = [args.targetRole, skillsQuery].filter(Boolean).join(' ');
      const res = await backendClient.searchJobs({
        query,
        location: args.location,
        page: 1,
        limit: 6,
      }, token);

      const rawItems = Array.isArray(res) ? res : (res.data || res.items || []);
      const jobs = rawItems.map((j) => ({
        id: String(j.id || j._id || ''),
        title: j.title,
        company: j.company?.name || 'Công ty tuyển dụng',
        location: j.location,
        salary: formatSalary(j.salaryRange || j.salary),
        skills: Array.isArray(j.requirements) ? j.requirements : [],
        url: j.id ? `/jobs/${j.id}` : '#',
      }));

      return {
        recommendedFor: {
          skills: args.skills,
          targetRole: args.targetRole,
        },
        count: jobs.length,
        jobs,
        summary: `Đã chọn lọc ${jobs.length} công việc phù hợp nhất với hồ sơ kỹ năng của bạn.`,
      };
    }

    default:
      throw new Error(`Unknown job tool: ${name}`);
  }
}

function formatSalary(salary) {
  if (!salary) return 'Thỏa thuận';
  if (typeof salary === 'string') return salary;
  if (typeof salary === 'object') {
    const min = salary.min;
    const max = salary.max;
    const cur = salary.currency || 'VND';
    if (min && max) return `${min.toLocaleString()} - ${max.toLocaleString()} ${cur}`;
    if (min) return `Từ ${min.toLocaleString()} ${cur}`;
    if (max) return `Lên đến ${max.toLocaleString()} ${cur}`;
  }
  return 'Thỏa thuận';
}
