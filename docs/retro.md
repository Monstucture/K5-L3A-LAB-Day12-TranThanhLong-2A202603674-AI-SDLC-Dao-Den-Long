# Retro — Mây và Đêm Đảo Bến (4 phase)

> Bản nháp trung thực do trợ lý AI soạn từ lịch sử làm việc. Các mục cần số liệu mà trợ lý không có (token/chi phí, điểm Evaluation của từng phase) để trống để tác giả điền — không bịa số.

## Evaluation 4 phase
| Phase | Nội dung | Điểm Evaluation |
|---|---|---|
| 1 | Đêm 1, Simulation Core, headless, contract v1.0 | _điền_ |
| 2 | 3 Đêm, dash, bùa, Gió Lạc, tuning chuẩn (v1.1) | _điền_ |
| 3 | Đèn cạn dầu, thắng bình minh, điểm mới (v1.2) | _điền_ |
| 4 | Bench, soak, bảng xếp hạng, a11y, đóng gói (v1.3) | _điền_ |

## Điều gì hiệu quả
- Một Simulation Core dùng chung + test contract: mọi thay đổi luật đều bị bắt ngay (ví dụ lệch lịch spawn Đêm 2/3 so với Phase 2 được phát hiện khi đối chiếu ticket và sửa bằng một test hồi quy).
- Cờ opt-in (`arcade`, `bench`) cho phép thêm gameplay GUI mà không đổi đầu ra headless.
- AGENTS.md ghi rõ "không đổi tuning/event schema" nên AI hỏi lại thay vì tự đổi luật.

## Điều gì không hiệu quả / lần AI sai và cách phát hiện
- AI nhận định "FPS không đo được vì WebGL phần mềm" — sai: pane trình duyệt đang bị ẩn nên bị throttle. Phát hiện khi bench chạy đúng (210 FPS khi pane hiển thị).
- Một bài test async không được `await` nên khẳng định `contract_version` chưa từng được kiểm. Phát hiện khi nâng lên 1.3 mà test không đỏ; đã chuyển thành test đồng bộ.
- Bug tồn đọng: màn Bình Minh bị vẽ đè bởi màn kết quả Đêm 3 mỗi frame; phát hiện khi viết luồng nhập tên.
- Lỗi lặp: heredoc/regex trên file CRLF làm patch tự động không áp dụng; phát hiện vì script chủ động `throw` khi không tìm thấy mốc.

## Harness giúp nhiều nhất
AGENTS.md (luật bất khả xâm phạm) + bộ test contract/edge-case chạy sau mỗi thay đổi; sau đó là skill `phase2-simulation`.

## Token / chi phí
_Chưa có số liệu — điền từ trang usage của công cụ._ Cách tiết kiệm đã áp dụng: đọc có chọn lọc (grep + đọc đoạn), vá bằng script thay vì gửi lại cả file, giữ bản tóm tắt ngữ cảnh.

## Nếu làm lại
- Đo hiệu năng và bộ nhớ từ Phase 1, không để đến cuối.
- Đặt cờ "chế độ trình bày" (arcade/bench) vào core từ đầu thay vì vá dần.
- Tách `main.js` (rất lớn) thành module sớm hơn; thêm test tự động cho GUI (Playwright).
