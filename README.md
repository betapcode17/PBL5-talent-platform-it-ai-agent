# AI-agents — Hệ thống Multi-Agent AI cho Tuyển Dụng IT

Hệ thống AI Multi-Agent chuyên sâu cho nền tảng tuyển dụng việc làm, được xây dựng hoàn toàn bằng **Node.js / JavaScript (Express.js, ESM)** và sử dụng **Google Gemini API** (`gemini-2.5-flash` / `gemini-2.0-flash`) với cơ chế **Function Calling (Tools)** phân cấp.

---

## 1. Kiến trúc Hệ thống Multi-Agent

Hệ thống vận hành theo mô hình **Master Orchestrator / Supervisor**:

```text
                           [ User Message ]
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │   Master Orchestrator Agent  │
                   │ (Gemini 2.5 Flash + Routing) │
                   └──────────────┬───────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
      ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│    Nhóm A     │          │    Nhóm B     │          │    Nhóm C     │          │    Nhóm D     │
│   Job Search  │          │  CV & Career  │          │ System Action │          │   System QA   │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │                          │
        └──────────────────────────┼──────────────────────────┴──────────────────────────┘
                                   │
                                   ▼
                 ┌──────────────────────────────────┐
                 │     NestJS Backend & MongoDB     │
                 │   http://localhost:4000 (APIs)   │
                 └──────────────────────────────────┘
```

---

## 2. Chi tiết 4 Nhóm Tools

### 🔍 Nhóm A — Tìm kiếm việc làm
- `search_jobs`: Tìm kiếm việc làm theo từ khóa, kỹ năng, địa điểm, ngành nghề và mức lương.
- `get_latest_jobs`: Lấy danh sách việc làm mới nhất vừa đăng tuyển.
- `recommend_jobs`: Gợi ý công việc tối ưu nhất dựa trên bộ kỹ năng (skills) hoặc vị trí mục tiêu của ứng viên.

### 📄 Nhóm B — CV & Tư vấn nghề nghiệp
- `analyze_cv_content`: Đọc và phân tích hồ sơ CV (PDF/Text), chấm điểm chất lượng (thang điểm 10), nhận diện điểm mạnh, điểm yếu và phần còn thiếu.
- `match_cv_with_jd`: So sánh độ tương thích (%) giữa CV và bản mô tả công việc (JD), chỉ ra các kỹ năng khớp và kỹ năng còn thiếu.
- `generate_career_roadmap`: Xây dựng lộ trình học tập, dự án mẫu và chuẩn bị phỏng vấn theo từng giai đoạn cụ thể.

### ⚡ Nhóm C — Hành động trên hệ thống
- `apply_job`: Nộp đơn ứng tuyển trực tiếp vào một công việc (có bước yêu cầu người dùng xác nhận an toàn trước khi nộp).
- `bookmark_job`: Lưu công việc vào danh sách yêu thích.
- `unbookmark_job`: Bỏ lưu công việc.
- `get_my_bookmarks`: Tra cứu danh sách việc làm đã lưu của người dùng.
- `follow_company`: Theo dõi tin tuyển dụng mới của một công ty.
- `unfollow_company`: Hủy theo dõi công ty.
- `get_my_applications`: Tra cứu danh sách và trạng thái các đơn ứng tuyển của ứng viên.

### ❓ Nhóm D — Hỏi đáp & Tra cứu Backend
- `get_job_detail`: Tra cứu toàn bộ thông tin chi tiết một công việc (mô tả, yêu cầu, quyền lợi, mức lương) theo Job ID.
- `get_company_detail`: Tra cứu thông tin hồ sơ công ty (quy mô, địa chỉ, website, lĩnh vực).
- `get_company_jobs`: Lấy danh sách tất cả các việc làm đang mở tuyển của một công ty.
- `get_all_companies`: Danh sách các doanh nghiệp trên hệ thống.
- `platform_faq`: Giải đáp các thắc mắc thường gặp về quy trình ứng tuyển, cách tạo hồ sơ.

---

## 3. Cài đặt & Khởi chạy

### Bước 1: Cấu hình Môi trường (`.env`)
Tạo file `.env` (hoặc sao chép từ `.env.example`):

```bash
PORT=8000
BACKEND_API_URL=http://localhost:4000
CORS_ORIGIN=*

# Gemini API Key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
GEMINI_MODEL=gemini-2.5-flash

# MongoDB Atlas Database
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=it_job_ai
```

### Bước 2: Khởi chạy Server
```bash
# Cài đặt thư viện
npm install

# Chạy chế độ phát triển (Auto reload khi code thay đổi)
npm run dev

# Chạy chế độ Production
npm start

# Chạy kiểm thử tự động toàn diện
npm test
```

Server sẽ lắng nghe tại: `http://localhost:8000`

---

## 4. Danh sách API Endpoints Chính

| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/chatbot/message` | Gửi tin nhắn chat, nhận phản hồi kèm danh sách Job Cards có cấu trúc |
| `POST` | `/chatbot/message/stream` | Stream tin nhắn qua SSE (Server-Sent Events) |
| `GET` | `/chatbot/conversation` | Lấy danh sách các cuộc trò chuyện |
| `POST` | `/chatbot/conversation` | Tạo cuộc trò chuyện mới |
| `GET` | `/chatbot/conversation/:id/message` | Lấy lịch sử tin nhắn của một cuộc trò chuyện |
| `DELETE` | `/chatbot/conversation/:id` | Xóa cuộc trò chuyện |
| `POST` | `/chatbot/conversation/rename` | Đổi tên cuộc trò chuyện |
| `POST` | `/cv/analyze` | Upload file PDF CV để phân tích điểm mạnh, điểm yếu |
| `POST` | `/cv/match-jd` | So khớp CV với JD text hoặc Job ID |
| `GET` | `/chatbot/health` | Kiểm tra trạng thái hoạt động của hệ thống |
