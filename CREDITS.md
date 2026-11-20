# CREDITS

- **Ý tưởng & thiết kế, nhân vật (Mây, Bóng Mực, Đảo Bến), tên gọi:** bản gốc của lab “Đảo Đèn Lồng” / PRD `PRD_May_Dem_Lantern.md`.
- **Đồ họa 3D trong game:** tự tạo bằng geometry primitives của Three.js (không dùng mô hình ngoài).
- **Thư viện:** [Three.js](https://threejs.org/) — MIT License (`node_modules/three`).
- **Âm thanh:** nhạc nền và hiệu ứng được **sinh thủ tục bằng Web Audio API** (`src/game/audio.js`); không dùng file âm thanh hay sample bên ngoài.
- **Sprite pixel (Mây, Bóng Mực):** vẽ bằng code từ chuỗi ký tự (`src/game/fx.js`); không dùng ảnh ngoài. Ảnh chụp màn hình trong `docs/img/` là chụp từ chính game.
- **Hậu kỳ HD-2D:** `EffectComposer`, `UnrealBloomPass`, `OutputPass` từ Three.js examples (MIT); tilt-shift/vignette là shader tự viết.
- **Công cụ AI:** LM Studio Bionic (Phase 1–2) và Claude Code (Anthropic, Phase 3–4) viết/duyệt mã, test, tài liệu theo hướng dẫn của tác giả; mọi thay đổi được kiểm chứng bằng `npm test`, headless run và bench/soak.
- **Code/AI:** Mã do con người phối hợp trợ lý AI (LM Studio Bionic) soạn, có kiểm chứng bằng test. Chi tiết trong README (mục “Giả định & AI usage”).

Vui lòng không sao chép toàn bộ repo này; việc dùng asset phải ghi nguồn.
