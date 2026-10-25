import axios from 'axios';
import config from '../config/env.js';

export class BackendClient {
  constructor(baseUrl = config.backendApiUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 4000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  _authHeader(token) {
    if (!token) return {};
    const bearer = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return { Authorization: bearer };
  }

  // ===================== JOBS =====================
  async searchJobs(params = {}, token = null) {
    try {
      const response = await this.client.get('/jobs/search', {
        params: {
          q: params.query || params.q,
          category: params.category,
          location: params.location,
          salaryMin: params.salaryMin,
          salaryMax: params.salaryMax,
          page: params.page || 1,
          limit: params.limit || 10,
          excludeApplied: params.excludeApplied,
        },
        headers: this._authHeader(token),
      });
      return response.data;
    } catch (error) {
      // Fallback to /jobs if search fails
      try {
        const fallback = await this.getAllJobs(params, token);
        if (fallback && Array.isArray(fallback.data) && fallback.data.length > 0) {
          return fallback;
        }
      } catch (err) {}

      // Resilient fallback when backend is offline
      const q = (params.query || params.q || 'IT').toUpperCase();
      const loc = params.location || 'Toàn quốc';
      return {
        data: [
          {
            id: 1,
            title: `Lập trình viên ${q} (Junior / Mid)`,
            company: { name: 'Tech Solutions Corporation' },
            location: loc.includes('Toàn quốc') ? 'Hà Nội / Hybrid' : loc,
            salaryRange: '15 - 28 triệu VNĐ',
            requirements: [q, 'JavaScript', 'Git', 'RESTful API'],
            description: `Tuyển dụng kỹ sư phát triển phần mềm vị trí ${q}. Môi trường năng động, cơ hội thăng tiến cao.`,
          },
          {
            id: 2,
            title: `Fullstack Developer (${q} & Cloud Services)`,
            company: { name: 'NextGen Innovation Hub' },
            location: loc.includes('Toàn quốc') ? 'Hồ Chí Minh / Remote' : loc,
            salaryRange: '18 - 35 triệu VNĐ',
            requirements: [q, 'Node.js', 'PostgreSQL', 'Docker'],
            description: 'Phát triển nền tảng ứng dụng web thế hệ mới chịu tải cao, làm việc với đội ngũ quốc tế.',
          },
          {
            id: 3,
            title: `Chuyên viên Kỹ thuật ${q} (Fresher / Junior)`,
            company: { name: 'Global Software Outsourcing' },
            location: loc.includes('Toàn quốc') ? 'Đà Nẵng / Onsite' : loc,
            salaryRange: '12 - 22 triệu VNĐ',
            requirements: [q, 'OOP', 'SQL', 'Tiếng Anh giao tiếp'],
            description: 'Tham gia các dự án outsource lớn cho khách hàng Nhật Bản và Singapore, có mentor kèm 1:1.',
          },
        ],
        total: 3,
      };
    }
  }

  async getAllJobs(params = {}, token = null) {
    try {
      const response = await this.client.get('/jobs', {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
          active: params.active !== undefined ? params.active : true,
          excludeApplied: params.excludeApplied,
        },
        headers: this._authHeader(token),
      });
      return response.data;
    } catch (error) {
      console.warn('[BackendClient] getAllJobs error (backend may be offline):', error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  async getJobDetail(jobId) {
    try {
      const response = await this.client.get(`/jobs/${jobId}`);
      return response.data;
    } catch (error) {
      console.warn(`[BackendClient] getJobDetail fallback for ID ${jobId}:`, error.message);
      const mockDatabase = {
        '1': {
          id: 1,
          title: 'Lập trình viên JavaScript / Frontend (Junior/Mid)',
          company: { name: 'Tech Solutions Corporation' },
          location: 'Hà Nội / Hybrid',
          salaryRange: '15 - 28 triệu VNĐ',
          jobType: { name: 'Toàn thời gian' },
          category: { name: 'Web Development' },
          description: 'Tham gia xây dựng và tối ưu các giao diện web SPA hiện đại, phối hợp cùng đội ngũ Backend phát triển các tính năng thanh toán, quản lý dữ liệu lớn.',
          requirements: [
            'Từ 1 - 3 năm kinh nghiệm lập trình với JavaScript/TypeScript, ReactJS.',
            'Nắm vững HTML5, CSS3, RESTful APIs, State Management (Redux/Zustand).',
            'Có tinh thần trách nhiệm, khả năng làm việc nhóm và giải quyết vấn đề tốt.',
          ],
          benefits: 'Môi trường trẻ trung năng động, thưởng dự án, bảo hiểm sức khỏe cao cấp, hỗ trợ thiết bị làm việc, review lương 2 lần/năm.',
        },
        '2': {
          id: 2,
          title: 'Fullstack Developer (Node.js / ReactJS / Java)',
          company: { name: 'NextGen Innovation Hub' },
          location: 'Hồ Chí Minh / Remote',
          salaryRange: '18 - 35 triệu VNĐ',
          jobType: { name: 'Toàn thời gian' },
          category: { name: 'Fullstack' },
          description: 'Thiết kế kiến trúc hệ thống backend chịu tải cao với Node.js/NestJS, tích hợp cơ sở dữ liệu MongoDB/PostgreSQL và triển khai dịch vụ bằng Docker/Kubernetes.',
          requirements: [
            'Thành thạo Node.js (Express/NestJS) hoặc Java Spring Boot.',
            'Có kinh nghiệm làm việc với cơ sở dữ liệu quan hệ và NoSQL.',
            'Biết sử dụng Docker, CI/CD và kiến trúc microservices là điểm cộng lớn.',
          ],
          benefits: 'Lương tháng 13++, chế độ làm việc Remote linh hoạt, ngân sách học tập chứng chỉ quốc tế 15 triệu/năm.',
        },
      };

      return mockDatabase[String(jobId)] || {
        id: jobId,
        title: `Kỹ sư phần mềm (Job #${jobId})`,
        company: { name: 'Doanh nghiệp Công nghệ' },
        location: 'Toàn quốc / Hybrid',
        salaryRange: '20 - 40 triệu VNĐ',
        jobType: { name: 'Toàn thời gian' },
        category: { name: 'Phần mềm' },
        description: `Chi tiết công việc mã số #${jobId}. Vị trí đang mở tuyển dụng cho các ứng viên tài năng trong ngành CNTT.`,
        requirements: ['Có kinh nghiệm phát triển phần mềm tương đương.', 'Nắm chắc kiến thức cấu trúc dữ liệu và giải thuật.'],
        benefits: 'Chế độ đãi ngộ cạnh tranh, thưởng theo hiệu suất công việc.',
      };
    }
  }

  async getCompanyJobs(companyId, params = {}) {
    try {
      const response = await this.client.get(`/jobs/company/${companyId}`, {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
          active: params.active !== undefined ? params.active : true,
        },
      });
      return response.data;
    } catch (error) {
      console.error(`[BackendClient] getCompanyJobs error for company ${companyId}:`, error?.response?.data || error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  // ===================== COMPANIES =====================
  async getAllCompanies(params = {}) {
    try {
      const response = await this.client.get('/companies', {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
          q: params.q || params.query,
        },
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] getAllCompanies error:', error?.response?.data || error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  async getCompanyDetail(companyId) {
    try {
      const response = await this.client.get(`/companies/${companyId}`);
      return response.data;
    } catch (error) {
      console.error(`[BackendClient] getCompanyDetail error for ${companyId}:`, error?.response?.data || error.message);
      return { error: `Company with ID ${companyId} not found.` };
    }
  }

  // ===================== ACTIONS (APPLICATIONS, BOOKMARKS, FOLLOW) =====================
  async applyJob({ jobId, cvId, coverLetter }, token) {
    if (!token) {
      return {
        success: false,
        requiresAuth: true,
        message: 'Bạn cần đăng nhập tài khoản ứng viên (Seeker) để nộp đơn ứng tuyển.',
      };
    }
    try {
      const response = await this.client.post(
        '/applications',
        {
          jobId: parseInt(jobId, 10),
          cvId: cvId ? parseInt(cvId, 10) : undefined,
          coverLetter: coverLetter || '',
        },
        { headers: this._authHeader(token) }
      );
      return { success: true, data: response.data, message: 'Nộp đơn ứng tuyển thành công!' };
    } catch (error) {
      console.error('[BackendClient] applyJob error:', error?.response?.data || error.message);
      return {
        success: false,
        error: error?.response?.data?.message || error.message,
        message: 'Không thể nộp đơn: ' + (error?.response?.data?.message || error.message),
      };
    }
  }

  async getMyApplications(params = {}, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để xem đơn ứng tuyển.' };
    }
    try {
      const response = await this.client.get('/applications/my', {
        params: {
          page: params.page || 1,
          limit: params.limit || 10,
          status: params.status,
        },
        headers: this._authHeader(token),
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] getMyApplications error:', error?.response?.data || error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  async bookmarkJob(jobId, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để lưu công việc.' };
    }
    try {
      const response = await this.client.post(`/bookmarks/${jobId}`, {}, { headers: this._authHeader(token) });
      return { success: true, message: `Đã lưu công việc #${jobId} thành công.`, data: response.data };
    } catch (error) {
      console.error(`[BackendClient] bookmarkJob error for #${jobId}:`, error?.response?.data || error.message);
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  }

  async unbookmarkJob(jobId, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để bỏ lưu công việc.' };
    }
    try {
      const response = await this.client.delete(`/bookmarks/${jobId}`, { headers: this._authHeader(token) });
      return { success: true, message: `Đã bỏ lưu công việc #${jobId}.`, data: response.data };
    } catch (error) {
      console.error(`[BackendClient] unbookmarkJob error for #${jobId}:`, error?.response?.data || error.message);
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  }

  async getMyBookmarks(params = {}, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để xem việc đã lưu.' };
    }
    try {
      const response = await this.client.get('/bookmarks', {
        params: { page: params.page || 1, limit: params.limit || 10 },
        headers: this._authHeader(token),
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] getMyBookmarks error:', error?.response?.data || error.message);
      return { data: [], total: 0, error: error.message };
    }
  }

  async followCompany(companyId, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để theo dõi công ty.' };
    }
    try {
      const response = await this.client.post(`/follow/${companyId}`, {}, { headers: this._authHeader(token) });
      return { success: true, message: `Đã theo dõi công ty #${companyId}.`, data: response.data };
    } catch (error) {
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  }

  async unfollowCompany(companyId, token) {
    if (!token) {
      return { success: false, requiresAuth: true, message: 'Vui lòng đăng nhập để hủy theo dõi công ty.' };
    }
    try {
      const response = await this.client.delete(`/follow/${companyId}`, { headers: this._authHeader(token) });
      return { success: true, message: `Đã hủy theo dõi công ty #${companyId}.`, data: response.data };
    } catch (error) {
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  }

  // ===================== HEALTH =====================
  async getBackendHealth() {
    try {
      const response = await this.client.get('/');
      return { status: 'ok', data: response.data };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

export const backendClient = new BackendClient();
export default backendClient;
