# Phase 4 — Bình minh v1.0.0 (Test Contract v1.3)

| Mục | Tiêu chí chấp nhận | Kiểm chứng |
|---|---|---|
| Bench | `bench.json` có đủ trường, `contract_version "1.3"`; cảnh: Đêm 1, 200 shade wander, 100 đom đóm, L1–L3 sáng fuel 100; không spawn/damage/pickup/hao dầu/kết thúc; camera R=30, Y=15, 15 s/vòng; 3 s khởi động | test `P4 bench scene`; `./scripts/bench.sh`; `bench.json` |
| Soak | 10 Đêm liên tiếp, seed 7+i, input ngẫu nhiên; `crashes = 0`; `mem_end ≤ 1.2 × mem_start` | test `P4 soak`; `soak.json` |
| Bảng xếp hạng | tên 3–12 `[A-Za-z0-9_]` (+ chữ có dấu); top 10; hòa điểm → đạt trước đứng trên; còn sau khi mở lại; có màn từ menu; export `{"entries":[…]}` | test `P4 leaderboard`; thử GUI + `run.sh --export-leaderboard` |
| Đổi phím | 9 hành động; báo trùng; khôi phục mặc định; lưu | test `P4 key bindings`; thử GUI |
| Chỉ báo hình ảnh | caption + mũi tên mép màn hình cho shade spawn; caption cho gió, 10 s cuối, đèn < 30 | thử GUI |
| Giảm chuyển động / chữ | tắt rung camera + animation; chữ ≥ 18 px, tùy chọn ×1.25 | thử GUI |
| Đóng gói | 3 lệnh để chơi; README/CHANGELOG/CREDITS/LICENSE | repo |
| Release | tag `phase-4`, GitHub Release v1.0.0, bench/soak commit | **chưa thực hiện — cần chủ repo xác nhận** |
