# Video demo (.mp4, < 5 phút) — chưa quay

Video chưa được quay trong phiên làm việc này (không có công cụ ghi màn hình). Kịch bản gợi ý:

1. (0:00) `npm test` → 53/53 và `node tests/contract/edge-cases.js` → 18/18.
2. (0:30) Headless: `./scripts/headless.sh --seed 1 --night 3 --ticks 21600 --out out.jsonl` xong trong ≤ 30 s; chạy 2 lần cùng seed, so byte.
3. (1:15) Chơi trực tiếp Đêm 1 → thắp đèn, tiếp dầu, Bóng Mực drain, Tỏa Sáng.
4. (2:30) Menu: đổi phím (báo trùng), chữ lớn, giảm chuyển động; lưu tên vào bảng xếp hạng; `--export-leaderboard`.
5. (3:30) `./scripts/bench.sh --seed 42 --duration 30 --out bench.json` và `./scripts/soak.sh --seed 7 --nights 10 --out soak.json`.

Sau khi quay, lưu thành `docs/demo/demo.mp4` hoặc đính kèm GitHub Release v1.0.0.
