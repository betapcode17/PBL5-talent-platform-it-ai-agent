import backendClient from '../services/backendClient.js';
import pdfService from '../services/pdfService.js';

export const cvToolsDeclarations = [
  {
    name: 'analyze_cv_content',
    description: 'Phân tích nội dung văn bản CV: đánh giá chất lượng hồ sơ, nhận diện các kỹ năng chính, điểm mạnh, điểm yếu và các phần còn thiếu.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cvText: {
          type: 'STRING',
          description: 'Nội dung văn bản trích xuất từ CV của ứng viên.',
        },
      },
      required: ['cvText'],
    },
  },
  {
    name: 'match_cv_with_jd',
    description: 'So sánh và tính độ tương thích (%) giữa CV ứng viên và một tin tuyển dụng (theo Job ID hoặc nội dung JD text), chỉ ra các kỹ năng khớp và kỹ năng còn thiếu.',
    parameters: {
      type: 'OBJECT',
      properties: {
        cvText: {
          type: 'STRING',
          description: 'Nội dung hoặc các kỹ năng chính từ CV ứng viên.',
        },
        jobId: {
          type: 'NUMBER',
          description: 'ID của công việc cần so khớp trên hệ thống (nếu có).',
        },
        jdText: {
          type: 'STRING',
          description: 'Nội dung bản mô tả công việc (JD) để đối chiếu (nếu không có jobId).',
        },
      },
      required: ['cvText'],
    },
  },
  {
    name: 'generate_career_roadmap',
    description: 'Xây dựng lộ trình học tập, nâng cao kỹ năng và kế hoạch hành động cụ thể để ứng viên đạt được vị trí công việc mong muốn.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetRole: {
          type: 'STRING',
          description: 'Vị trí công việc mục tiêu (ví dụ: "Senior Fullstack Engineer", "DevOps Specialist", "AI Engineer").',
        },
        currentSkills: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Danh sách kỹ năng hiện tại của ứng viên.',
        },
        missingSkills: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Các kỹ năng còn thiếu cần bổ sung.',
        },
      },
      required: ['targetRole'],
    },
  },
];

export async function executeCvTool(name, args = {}, context = {}) {
  switch (name) {
    case 'analyze_cv_content': {
      const parsed = pdfService.extractCvInfo(args.cvText || '');
      const skills = parsed.skills || [];

      // Determine strengths & weaknesses
      const strengths = [];
      const weaknesses = [];

      if (skills.length >= 5) {
        strengths.push(`Sở hữu nền tảng công nghệ đa dạng: ${skills.slice(0, 6).join(', ')}`);
      } else if (skills.length > 0) {
        strengths.push(`Đã có kỹ năng nền tảng: ${skills.join(', ')}`);
      } else {
        weaknesses.push('Chưa thể hiện rõ các từ khóa kỹ năng kỹ thuật chính trong CV.');
      }

      if (parsed.hasProjects) {
        strengths.push('Có mô tả dự án thực tế hoặc bài tập lớn liên quan.');
      } else {
        weaknesses.push('Nên bổ sung thêm phần Dự án (Projects) có kèm đường link Github/Demo.');
      }

      if (parsed.hasExperience) {
        strengths.push('Có quá trình làm việc / kinh nghiệm thực tế.');
      } else {
        weaknesses.push('Nên bổ sung thêm các hoạt động ngoại khóa, đồ án hoặc thực tập để bù đắp kinh nghiệm.');
      }

      if (!parsed.email || !parsed.phone) {
        weaknesses.push('Thông tin liên hệ (Email / Số điện thoại) chưa được định dạng rõ ràng ở đầu trang.');
      }

      // Always provide constructive weaknesses if none triggered by basic checks
      if (weaknesses.length === 0) {
        weaknesses.push('Các gạch đầu dòng mô tả dự án cần bổ sung số liệu đo lường cụ thể (Metrics) theo mô hình STAR (ví dụ: cải thiện 25% tốc độ tải trang, quản lý 500 người dùng).');
        weaknesses.push('Nên bổ sung thêm chứng chỉ công nghệ (như AWS/Azure/Oracle) hoặc chứng chỉ ngoại ngữ để nâng cao độ tin cậy.');
        weaknesses.push('Có thể mở rộng thêm các kỹ năng hệ thống như Docker, kiểm thử tự động (Unit Test) và quy trình CI/CD.');
      }

      const rawScore = 6.0 + (Math.min(skills.length, 8) * 0.2) + (parsed.hasProjects ? 1.0 : 0) + (parsed.hasExperience ? 1.0 : 0);
      const qualityScore = Math.min(9.0, Math.max(5.0, rawScore));

      return {
        qualityScore: parseFloat(qualityScore.toFixed(1)),
        detectedSkills: skills,
        completeness: {
          hasContact: Boolean(parsed.email && parsed.phone),
          hasSkills: skills.length > 0,
          hasProjects: parsed.hasProjects,
          hasExperience: parsed.hasExperience,
        },
        strengths,
        weaknesses,
        recommendations: [
          'Tối ưu hóa các gạch đầu dòng theo công thức STAR (Situation - Task - Action - Result).',
          'Đưa các từ khóa kỹ năng quan trọng lên phần đầu của CV để hệ thống ATS dễ quét.',
          'Bổ sung số liệu cụ thể (ví dụ: tối ưu tốc độ 30%, quản lý hệ thống 10.000 người dùng).',
        ],
      };
    }

    case 'match_cv_with_jd': {
      let targetJdText = args.jdText || '';
      let jobTitle = 'Công việc mục tiêu';
      let jobCompany = 'Công ty tuyển dụng';

      if (args.jobId) {
        const job = await backendClient.getJobDetail(args.jobId);
        if (job && !job.error) {
          jobTitle = job.title || jobTitle;
          jobCompany = job.company?.name || jobCompany;
          const reqs = Array.isArray(job.requirements) ? job.requirements.join('\n') : (job.requirements || '');
          targetJdText = `${job.title}\n${job.description || ''}\n${reqs}`;
        }
      }

      const cvParsed = pdfService.extractCvInfo(args.cvText || '');
      const cvSkills = cvParsed.skills || [];

      // Extract skills from JD
      const jdParsed = pdfService.extractCvInfo(targetJdText);
      const jdSkills = jdParsed.skills || [];

      // Calculate matches
      const matchedSkills = cvSkills.filter((s) => jdSkills.includes(s));
      const missingSkills = jdSkills.filter((s) => !cvSkills.includes(s));

      let matchPercentage = 50;
      if (jdSkills.length > 0) {
        matchPercentage = Math.round((matchedSkills.length / jdSkills.length) * 100);
      } else {
        matchPercentage = matchedSkills.length > 0 ? 75 : 50;
      }
      matchPercentage = Math.min(95, Math.max(25, matchPercentage));

      return {
        jobTitle,
        jobCompany,
        jobId: args.jobId || null,
        matchScore: matchPercentage,
        matchedSkills,
        missingSkills,
        fitLevel: matchPercentage >= 75 ? 'Rất phù hợp' : (matchPercentage >= 50 ? 'Khá phù hợp (cần trau dồi thêm)' : 'Cần bổ sung nhiều kỹ năng'),
        advice: missingSkills.length > 0
          ? `Bạn nên trang bị thêm các kỹ năng quan trọng: ${missingSkills.slice(0, 4).join(', ')} trước khi nộp hồ sơ.`
          : 'Hồ sơ của bạn đã đáp ứng đầy đủ các yêu cầu công nghệ cốt lõi của vị trí này. Hãy tự tin ứng tuyển!',
      };
    }

    case 'generate_career_roadmap': {
      const missing = args.missingSkills || [];
      const role = args.targetRole || 'Chuyên viên kỹ thuật';

      return {
        targetRole: role,
        phases: [
          {
            phase: 'Giai đoạn 1: Củng cố kỹ năng cốt lõi (1 - 2 tháng)',
            focus: missing.slice(0, 2).length ? missing.slice(0, 2) : ['Kiến thức chuyên sâu ngôn ngữ & Framework chính'],
            actions: [
              'Nắm vững cú pháp nâng cao, các Design Patterns và nguyên lý Clean Code.',
              'Đọc tài liệu chính thức (Official Documentation) và hoàn thành các bài lab thực hành.',
            ],
          },
          {
            phase: 'Giai đoạn 2: Xây dựng dự án mẫu thực tế (2 - 3 tháng)',
            focus: missing.slice(2, 5).length ? missing.slice(2, 5) : ['Triển khai hệ thống, Database và CI/CD'],
            actions: [
              'Phát triển 1 dự án End-to-End giải quyết bài toán thực tế (Fullstack / Microservices).',
              'Đóng gói dự án bằng Docker, viết tài liệu README chỉn chu và đẩy lên GitHub.',
            ],
          },
          {
            phase: 'Giai đoạn 3: Tối ưu hồ sơ & Chuẩn bị phỏng vấn (1 tháng)',
            focus: ['Luyện thuật toán, System Design & Kỹ năng mềm'],
            actions: [
              'Cập nhật lại CV với các dự án mới thực hiện.',
              'Luyện tập trả lời các câu hỏi tình huống thực tế và tối ưu hóa hệ thống.',
              'Nộp hồ sơ ứng tuyển vào các công ty mục tiêu trên nền tảng.',
            ],
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown CV tool: ${name}`);
  }
}
