# Mây và Đêm Đảo Bến — Phase 1 (Đêm 1: Đảo Bến)

> Video demo: _chưa có_ (xem mục "Bằng chứng").

**Mây**, người giữ đèn nhỏ tuổi của một hòn đảo tròn giữa biển mây, phải nhặt **đom đóm**, nạp ánh sáng để **thắp lại 5 Đèn Lồng Lớn**, và tránh **Bóng Mực** — những sinh vật bóng đêm đuổi theo cô. Mỗi đèn được thắp làm hòn đảo sáng và an toàn hơn. Thắng khi 5 đèn sáng; thua khi hết sức khỏe hoặc hết thời gian của đêm.

Game gồm **hai lớp dùng đúng một Simulation Core** (`src/core/simulation.js`):

- **GUI**: trình duyệt (Three.js) đọc state từ core để vẽ; không tự ý đổi logic.
- **Headless**: CLI Node gọi thẳng core, chạy tất định, xuất JSONL theo Test Contract v1.0.

---

## Quick Start (tối đa 3 lệnh)

Prerequisites: **Node.js ≥ 18** và **npm** (đã kiểm tra trên Node 26). Không cần GPU cho chế độ headless.

On macOS/Linux (or Git Bash), build dependencies and start the game:

```bash
./scripts/build.sh
./scripts/run.sh
```

On Windows PowerShell, run these from the repository folder:

```powershell
npm ci
npm run serve
```

Open `http://localhost:8080/` in your browser. Press `Ctrl+C` in the terminal to stop the server. On macOS/Linux, `run.sh` also attempts to open the browser automatically.

---

## Điều khiển (GUI)

| Hành động | Phím |
|---|---|
| Di chuyển | `W A S D` |
| Nhảy | `Space` |
| Nạp ánh sáng vào đèn (đứng gần đèn) | `E` |
| Tỏa sáng / đẩy lùi Bóng Mực | `F` |
| Xoay camera | Kéo chuột (bấm giữ + di chuyển) |
| Chơi lại | Nút **Chơi lại** hoặc `R` |

**Mục tiêu:** nhặt đom đóm (`carry_capacity` tối đa), tránh Bóng Mực, mang ánh sáng đến từng đèn và bấm `E`. Mỗi đèn cần `lantern_cost` ánh sáng.

---

## Chế độ headless (Test Contract v1.0)

```bash
./scripts/headless.sh --seed <int> --night 1 \
  [--scenario <file.json>] [--inputs <file.json>] \
  --ticks <int> --out <file.jsonl> [--snapshot-every <int>]
```

- `--seed`, `--night`, `--ticks`, `--out` bắt buộc; `--scenario`, `--inputs`, `--snapshot-every` (mặc định 10) tùy chọn.
- Sim ở **60 tick/s cố định**. Exit code: `0` hợp lệ, `2` scenario/input sai schema, `1` lỗi runtime.
- Cùng `--seed` + scenario + inputs → output JSONL **giống hệt từng byte** (dùng PRNG xorshift32 có seed).

Ví dụ thực:

```bash
./scripts/headless.sh --seed 123 --night 1 --ticks 600 --out evidence/headless/demo.jsonl
./scripts/headless.sh --seed 1 --night 1 --ticks 5 --scenario scenarios/hc04_pickup.json \
  --inputs inputs/hc04_walk_to_mote.json --out evidence/headless/hc04.jsonl --snapshot-every 1
```

Cách tái lập quyết định test: chạy cùng lệnh hai lần rồi `cmp` hai file (đã có `evidence/headless/det_a.jsonl` vs `det_b.jsonl`).

---

## Chạy test

```bash
npm test
```

Chạy 24 kiểm thử (HC-01…HC-23 + regression) — đầu ra in ra màn hình, exit code 0 khi đạt hết.

---

## Cách tính điểm

- Nhặt một đom đóm: **+10** (mỗi mote 1 lần).
- Thắp một đèn: **+100** (chỉ khi chuyển unlit→lit do gameplay).
- Choáng một Bóng Mực: **+20** (mỗi ID shade 1 lần).
- Khi **thắng**: + `floor(time_left_s) × 2` (thưởng thời gian) + `flames còn lại × 50` (thưởng sức khỏe).

Ví dụ (baseline): nhặt 30 mote + thắp 5 đèn + lần đầu choáng 2 shade + thắng khi còn 40s và còn 2 flames = `30×10 + 5×100 + 2×20 + 40×2 + 2×50 = 1,020`.

---

## Tuning quan trọng

File **`game.contract.json`** ở thư mục gốc là nguồn tuning duy nhất và **khớp chính xác với code** (có test đối chiếu). Các giá trị chính:

| Field | Giá trị | Ý nghĩa |
|---|---|---|
| `player_speed` | 6.0 | Tốc độ đi (m/s) |
| `carry_capacity` | 10 | Số ánh sáng Mây mang tối đa |
| `lantern_cost` | 5 | Ánh sáng cần cho mỗi đèn |
| `flames` | 3 | Sức khỏe ban đầu |
| `night1_duration_s` | 300 | Thời lượng Đêm 1 |
| `pulse_cost` / `pulse_radius` / `pulse_stun_s` | 2 / 6.0 / 2.5 | Chi phí, bán kính, thời gian choáng của kỹ năng tỏa sáng |
| `safe_radius` | 6.0 | Bán kính vùng an toàn quanh đèn sáng |
| `shade_speed` | 2.5 | Tốc độ Bóng Mực |
| `hit_drop_ratio` | 0.0 | Không đánh rơi ánh sáng khi bị hit |
| `fall_enabled` | false | Rơi khỏi đảo bị chặn, không phạt |

Hằng số vật lý nhảy (`jump_velocity=7 m/s`, `gravity=20 m/s²`) nằm ở `src/core/tuning.js` (ngoài tuning v1.0).

---

## Kiến trúc

```
src/core/           Simulation Core (tất định) + PRNG + tuning
src/contract/       Parser/validate scenario & inputs (+ schema errors)
src/cli.js          Headless mode (argparse, JSONL, exit codes)
src/game/           GUI: server.js, index.html, style.css, main.js (Three.js)
scripts/            build.sh, run.sh, headless.sh
tests/              run-all.js (HC-01..23 + regression)
scenarios/, inputs/ Ví dụ scenario & input
evidence/           Bằng chứng test/headless
game.contract.json  Tuning chuẩn (đồng bộ với code)
```

---

## Sáng tạo của tôi

- **“Đom đóm chúc mừng”**: khi một Đèn Lồng Lớn được thắp, một nhóm đốm sáng vàng bay vòng quanh đèn trong ~2 giây rồi tan dần (hình ảnh thuần trang trí).
- Đây chỉ là **VFX**, không có collider, không nhặt được, không gây sát thương, không tác động AI/điểm/tài nguyên thời gian.
- **Hoàn toàn không được khởi tạo trong headless** — chạy headless output không thay đổi (kiểm chứng ở HC-23).

---

## Bằng chứng kiểm chứng

| Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| Deterministic headless | Chạy cùng seed 2 lần, so byte | `evidence/headless/det_a.jsonl`, `det_b.jsonl` | ✅ giống nhau |
| 22+ test contract | `npm test` | log (xem dưới) | ✅ 24/24 |
| Pickup / deposit / lit / pulse / hit / safe-zone / win / lose | HC-04…HC-19 | `npm test` | ✅ |
| Schema sai → exit 2 | HC-21 | `npm test` | ✅ |
| Tuning khớp contract | Regression | `npm test` | ✅ |

> Cần bổ sung: ảnh/video gameplay thực (Mây, đom đóm, nạp đèn, Bóng Mực, màn thắng/thua, replay), và kết quả chạy trên macOS/Linux. Trạng thái hiện tại: **headless verified; GUI chưa chụp hình màn hình** — ghi trung thực.

---

## Giả định & AI usage

**Giả định:** engine là JS thuần + Three.js (không Godot); 3 `flames` ban đầu; mỗi đèn 5 ánh sáng; tổng 40 đom đóm mặc định; hit không làm rơi ánh sáng; rơi bị chặn không phạt; Đêm 1 = 300 giây; thưởng thời gian/sức khỏe chỉ khi thắng. PRD có tham chiếu “PRD-0 / Test Contract v1.0” không nằm trong file kèm — các hành vi theo PRD kèm và giả định hợp lý; cần đối chiếu PRD-0 khi có.

**AI usage:** project xây dựng bằng trợ lý AI (LM Studio Bionic): brainstorm/kiến trúc, viết Simulation Core + contract + tests + GUI; con người kiểm chứng bằng `npm test` và chạy headless. Ước tính token Phase 1 được ghi trong `docs/` (nhật ký AI) nếu cần.
