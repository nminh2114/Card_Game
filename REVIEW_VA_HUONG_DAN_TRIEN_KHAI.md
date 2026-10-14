# HƯỚNG DẪN CHẠY WEB & TRIỂN KHAI LÊN VERCEL

Tài liệu rút gọn này hướng dẫn nhanh 2 nội dung chính:
1. **Cách chạy web trên máy tính cá nhân (Local)**
2. **Cách đưa giao diện Web lên Vercel (Online)**

---

## PHẦN 1: CÁCH CHẠY WEB Ở MÁY LOCAL

Chỉ cần thực hiện 2 bước đơn giản:

### Bước 1: Khởi động Database & Cache (Docker)
> *Đảm bảo ứng dụng **Docker Desktop** đã được mở.*
Mở PowerShell tại thư mục dự án và chạy:
```powershell
docker-compose up -d
```

### Bước 2: Chạy Web Server
```powershell
dotnet run --project CardGame.Server
```

Khi terminal hiện thông báo:
```plaintext
Now listening on: http://localhost:5119
```
👉 Bạn mở trình duyệt và truy cập: **`http://localhost:5119`** là có thể trải nghiệm toàn bộ giao diện game bài và các tính năng!

### Thông Tin Tài Khoản Quản Trị Tối Cao (Super Admin):
- **Tên đăng nhập:** `admin`
- **Mật khẩu:** `Admin123!`
- **Quyền hạn Super Admin:**
  1. **Duyệt Nạp Tiền (Deposit Approval):** Khi người chơi chuyển khoản quét QR, lệnh nạp sẽ ở trạng thái `Chờ Duyệt`. Admin vào tab **`💳 Duyệt Nạp Tiền`** để đối soát biến động số dư ngân hàng và bấm **`✔ Duyệt Nạp`** để tiền cộng vào ví người chơi qua chuẩn giao dịch ACID (hoặc bấm **`✖ Từ Chối`** nếu không nhận được tiền). Có chuông thông báo đỏ hiển thị số đơn nạp cần xử lý ngay trên thanh Menu.
  2. **Quản Lý Người Chơi & Khóa Nick (Ban):** Tìm kiếm tài khoản, điều chỉnh số dư ví (`+50K`, `+200K`, `-50K`, hoặc số tùy chọn). Nếu phát hiện gian lận đánh quây, bấm **`🚫 Khóa Nick`** để chọn khóa `3 ngày`, `7 ngày`, `30 ngày` hoặc `Vĩnh viễn` kèm lý do vi phạm. Khi bị khóa, người chơi đó sẽ bị văng khỏi bàn và không thể đăng nhập. Admin có thể bấm **`🔓 Mở Khóa`** bất kỳ lúc nào.
  3. **Quản Lý Bàn Đang Chơi & Kick Người Chơi:** Xem tất cả các bàn đang hoạt động trong thời gian thực, số người ngồi và chip cược. Bấm **`🚨 Kick`** để mời ngay lập tức một người chơi ra khỏi bàn hoặc **`🛑 Giải Tán Bàn`**.
  4. **Tham Gia Chơi Game Bình Thường:** Admin vẫn có thể tham gia tạo bàn, ngồi ghế ảo và chơi Phỏm / Tá Lả / Tiến Lên như người chơi bình thường. Trên bàn chơi, Admin có vương miện vàng `👑 Admin` và có thêm nút **`🚨 Kick`** tại ghế đối thủ để xử lý gian lận tại chỗ.
  5. **Quản Lý Vòng Quay May Mắn (Spin Settings & Analytics):** Xem tổng số lượt quay trong ngày, tổng số chip đã trao, danh sách tài khoản tham gia. Admin có thể tùy chỉnh cơ cấu giải thưởng (Giải Đặc Biệt, Giải Nhất, Giải Nhì, v.v.) và bấm **`💾 Lưu Cài Đặt`** để áp dụng trực tiếp ngay lập tức.
  6. **Nhật Ký Quản Trị (Audit Logs):** Toàn bộ hành động duyệt nạp, trừ tiền, ban nick, kick người chơi đều được hệ thống lưu vết chi tiết (thời gian, người thực hiện, lý do).

### Tính Năng Vòng Quay May Mắn (Lucky Spin) Cho Người Chơi:
- Bấm nút **`🎰 May Mắn`** trên thanh Header.
- Mỗi tài khoản nhận tối đa **3 lượt quay / ngày** (tự động làm mới vào 00:00 hàng ngày).
- Hiệu ứng quay bánh xe Canvas mượt mà, âm thanh casino sống động, giải thưởng từ 100 🪙 đến 50.000 🪙. Chip thắng sẽ tự động cộng thẳng vào số dư ví của người chơi.

### Quy Trình Nạp Chip Dành Cho Người Chơi:
- Bấm nút **`+ Nạp Chip`** trên góc phải màn hình.
- Chọn mệnh giá (`20K`, `50K`, `100K`, `200K`, `500K`, `1M`) hoặc nhập số tiền tùy ý.
- Quét mã QR thanh toán của **DO TIEN NHAT MINH** (hỗ trợ ZaloPay, Viettel Money và hơn 50 ngân hàng).
- Bấm **"Sao chép"** nội dung chuyển khoản: `NAP <tên_tài_khoản>`.
- Bấm **"✔ Xác Nhận Đã Chuyển Khoản (Gửi Duyệt)"**. Hệ thống sẽ ghi nhận lệnh nạp ở trạng thái `⏳ Chờ Duyệt`.
- Xem danh sách và trạng thái các lệnh nạp gần nhất ngay trong mục "Lịch sử nạp gần đây của bạn". Khi Admin duyệt xong, chip sẽ tự động nhảy số dư ngay lập tức!

---

## PHẦN 2: HƯỚNG DẪN ĐƯA WEB LÊN VERCEL (ONLINE)

Vercel là nền tảng máy chủ đám mây miễn phí tối ưu nhất cho Frontend. Bạn có thể chọn 1 trong 2 cách triển khai sau:

---

### CÁCH 1: Triển khai qua GitHub (Khuyên dùng - Nhanh & Tự động cập nhật)

#### 1. Đẩy mã nguồn lên GitHub:
Mở PowerShell tại thư mục dự án:
```powershell
git init
git add .
git commit -m "Deploy Card Game to Vercel"
git branch -M main
# Tạo một repository mới trên github.com, sau đó liên kết:
git remote add origin https://github.com/<tai-khoan-cua-ban>/CardGame.git
git push -u origin main
```

#### 2. Kết nối và Deploy trên Vercel:
1. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
2. Bấm nút **Add New...** ➔ Chọn **Project**.
3. Tìm repository **CardGame** vừa tạo và bấm **Import**.
4. Tại mục **Root Directory**, bạn bấm **Edit** và chọn thư mục:
   ```plaintext
   CardGame.Server/wwwroot
   ```
   *(Hoặc để trống thư mục gốc vì dự án đã có sẵn file `vercel.json` tự động trỏ đến `CardGame.Server/wwwroot`).*
5. Bấm **Deploy**.
6. Sau khoảng 20-30 giây, Vercel sẽ cấp cho bạn một đường link miễn phí dạng:
   👉 `https://card-game-xxx.vercel.app`

---

### CÁCH 2: Triển khai trực tiếp bằng Vercel CLI (Không cần GitHub)

Nếu máy tính của bạn đã cài **Node.js**:

#### 1. Cài đặt Vercel CLI toàn cục (chỉ làm lần đầu):
```powershell
npm install -g vercel
```

#### 2. Deploy trực tiếp thư mục giao diện:
Vào thư mục chứa giao diện web và gõ lệnh:
```powershell
cd CardGame.Server/wwwroot
vercel
```

- Vercel sẽ hỏi đăng nhập (nếu chưa đăng nhập).
- Với các câu hỏi xác nhận cấu hình: Bạn chỉ cần nhấn **Enter** (chọn mặc định `Y`).
- Sau khi tải lên hoàn tất, Vercel sẽ in ra đường link Preview. Để đưa lên link chính thức (Production), bạn gõ:
```powershell
vercel --prod
```

---

### 📌 LƯU Ý QUAN TRỌNG VỀ BACKEND:
- Giao diện người dùng (HTML/CSS/JS) chạy trên Vercel có sẵn đầy đủ âm thanh Web Audio và thuật toán offline.
- Khi cần kết nối với máy chủ API .NET để lưu dữ liệu PostgreSQL lâu dài, bạn chỉ cần triển khai Backend .NET lên các nền tảng miễn phí hỗ trợ Docker/.NET như **Render.com**, **Railway.app** hoặc **Fly.io**, sau đó cập nhật địa chỉ API trong file `app.js`.
