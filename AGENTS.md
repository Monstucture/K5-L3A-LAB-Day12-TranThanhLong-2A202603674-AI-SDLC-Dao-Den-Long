# AGENTS.md — hướng dẫn cho AI agent làm việc trong repo này

## Dự án
Game 3D “Mây và Đêm Đảo Bến” — Phase 2, ba đêm. Một **Simulation Core** dùng chung cho GUI (Three.js/trình duyệt) và headless (Node CLI).

## Lệnh quan trọng
- Build deps: `./scripts/build.sh`
- Chạy GUI: `./scripts/run.sh` (mở `http://localhost:8080/`)
- Headless: `./scripts/headless.sh --seed 1 --night 1 --ticks 600 --out out.jsonl`
- Kiểm thử: `npm test` (Contract v1.1 + regression) và `node tests/contract/edge-cases.js`. **Chạy sau mọi thay đổi Simulation Core.**

## Quy tắc bất khả xâm phạm
1. **Giữ Test Contract v1.1**: field/event/tick semantics/tọa độ/exit code trong `src/contract`, `src/cli.js`, `game.contract.json` phải khớp spec Phase 2. Không tự đổi tuning baseline hoặc event schema.
2. **Đọc PRD (`PRD_May_Dem_Lantern.md`) + README + `game.contract.json` trước khi sửa gameplay.**
3. **Một Simulation Core duy nhất.** GUI và headless phải gọi cùng code. Không viết logic thứ hai trong render.
4. **Không thêm entity/hiệu ứng trang trí vào headless.** Mọi VFX (vd “Đom đóm chúc mừng”) chỉ nằm ở Presentation Layer và KHÔNG được khởi tạo khi chạy headless.
5. **Deterministic:** chỉ dùng PRNG có seed (`src/core/random.js`, xorshift32). Không dùng `Math.random`/`Date` trong core. Entity xử lý theo ID cố định.
6. **Tuning:** không tự sửa giá trị baseline mà không đồng bộ `game.contract.json` và README. `game.contract.json` phải khớp `src/core/tuning.js` (có test).
7. **Ba đêm:** bản đồ, vật lý, điểm sinh, lịch spawn và thời lượng lấy từ `src/core/tuning.js`; scenario/CLI phải chọn đúng Night 1, 2 hoặc 3.
8. **Pause:** `tick` tăng khi tạm dừng; `sim_tick`, timer và mọi logic gameplay phải đứng yên.
9. **GUI:** pause/settings/progression/render/audio chỉ ở `src/game/`; không tạo audio hoặc VFX trong headless.

Skill dành cho công việc Simulation Core: `.github/skills/phase2-simulation/SKILL.md`.

## Thứ tự sửa an toàn
1. Sửa Core logic trong `src/core/` (hoặc contract trong `src/contract/`).
2. Chạy `npm test`.
3. Nếu contract/README đổi, cập nhật `game.contract.json`/README rồi test lại.
4. Đồ họa/UI chỉ sửa trong `src/game/`, không bao giờ ảnh hưởng simulation.

## Phase 2 DoD
- `npm test` và `node tests/contract/edge-cases.js` đều đạt.
- Mỗi tính năng mới có ít nhất một headless scenario/regression.
- Một đêm headless tối đa 21.600 tick hoàn thành trong ≤30 giây.
- Acceptance criteria của gameplay/UI nằm trong `docs/phase2-spec.md`.

## Ví dụ làm đúng
- Thêm một cơ chế gameplay mới thì thêm vào `src/core/simulation.js` và cập nhật scenario/event/snapshot schema cùng test.
- Thêm hiệu ứng trang trí chỉ trong `src/game/main.js`, không thêm vào core/headless.
