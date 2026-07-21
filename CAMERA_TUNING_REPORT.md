# Báo cáo tinh chỉnh camera — NORKA R35

## Phạm vi

Lượt tinh chỉnh bố cục ban đầu được thực hiện tại hai viewport chính:

- Desktop: **1440 × 900**
- Mobile: **390 × 844**

Lượt kiểm tra coverage sau đó chụp lại toàn bộ 12 cảnh tại `1440 × 900` và `390 × 844`, đồng thời kiểm tra cảnh mới cùng các transition lân cận tại `768 × 1024` và `844 × 390`.

Trong riêng lượt camera này, không thay model, normalization transform, scale model, CSS transform, cơ chế GSAP master timeline hay kiến trúc Three scene; phần lighting nền sáng đã được xử lý ở lượt giao diện trước. Trong mã runtime 3D, các giá trị `position`, `target`, `fov` và waypoint trong `src/three/cameraShots.ts` được tinh chỉnh; một section `rear-signature` được bổ sung để hoàn thiện coverage ngoại thất.

Debug HUD phát triển vẫn được bật/tắt bằng phím **D** và nút **Copy shot** tiếp tục xuất object hợp lệ. Các tọa độ tốt nhất đã được lưu trực tiếp vào source.

## Desktop — before/after

| Section | Position trước | Position sau | Target trước | Target sau | FOV trước → sau |
|---|---|---|---|---|---:|
| Hero | `[-4.60, 1.75, 5.70]` | `[-7.15, 1.72, 7.45]` | `[0.00, 0.55, 0.75]` | `[-2.45, 0.47, 0.68]` | `32 → 31.5` |
| Aerodynamics | `[4.80, 1.20, 0.35]` | `[9.10, 1.30, -0.75]` | `[0.00, 0.52, 0.00]` | `[0.00, 0.42, -1.10]` | `30 → 32` |
| Performance | `[1.80, 3.80, 3.50]` | `[1.40, 4.90, 6.50]` | `[0.00, 0.70, 1.05]` | `[-0.90, 0.55, 1.30]` | `28 → 30` |
| Precision | `[-2.30, 0.72, 2.30]` | `[-5.65, 0.61, -5.82]` | `[-0.82, 0.38, 1.55]` | `[0.45, 0.36, -1.90]` | `26 → 44` |
| Explore | `[4.70, 1.80, 5.30]` | `[3.20, 1.90, 7.30]` | `[0.00, 0.55, 0.00]` | `[-1.40, 0.50, 1.25]` | `34 → 36.5` |

## Mobile — before/after

| Section | Position trước | Position sau | Target trước | Target sau | FOV trước → sau |
|---|---|---|---|---|---:|
| Hero | `[-5.50, 2.00, 7.40]` | `[-7.30, 2.15, 8.95]` | `[0.00, 0.58, 0.78]` | `[-0.30, 0.15, 0.50]` | `38 → 53` |
| Aerodynamics | `[6.70, 1.45, 0.55]` | `[16.50, 1.90, 0.55]` | `[0.00, 0.57, 0.05]` | `[0.00, 0.38, 0.05]` | `39 → 50` |
| Performance | `[2.90, 4.90, 5.55]` | `[4.15, 7.10, 9.35]` | `[0.00, 0.72, 1.00]` | `[0.15, 0.12, 0.85]` | `38 → 53` |
| Precision | `[-3.45, 0.92, 3.50]` | `[-5.78, 0.61, -6.00]` | `[-0.78, 0.40, 1.48]` | `[-0.65, 0.35, -1.10]` | `36 → 64` |
| Explore | `[6.35, 2.15, 7.25]` | `[8.50, 2.40, 9.80]` | `[0.00, 0.57, 0.00]` | `[0.00, 0.10, 0.00]` | `40 → 54` |

## Kết quả bố cục đã đo

| Viewport | Section | Kết quả |
|---|---|---|
| Desktop | Hero | Toàn bộ xe ở góc trước 3/4; bề ngang xe khoảng **55.49%** viewport; cản trước và bánh trước không bị cắt; xe nằm bên phải vùng copy. |
| Desktop | Aerodynamics | Thân xe khoảng **67.58%** chiều ngang viewport, nằm trong mục tiêu 65–75%. |
| Desktop | Performance | Góc nhìn từ trên xuống vùng capo; capo, đèn, cản và toàn bộ phần đầu vẫn nhận diện rõ. |
| Desktop | Precision | Toàn xe hiện ở góc sau-trái, bánh và phanh sau vẫn là điểm nhấn; bố cục tiếp tục quỹ đạo một chiều từ cảnh đuôi. |
| Desktop | Explore | Toàn xe nằm gọn; bề ngang khoảng **50.71%** viewport, có khoảng thở trước khi bật OrbitControls. |
| Mobile | Hero | Toàn xe nằm trong khung, cản trước còn khoảng trống; text bắt đầu phía dưới thân xe. |
| Mobile | Aerodynamics | Thân xe khoảng **73.94%** chiều ngang viewport, nằm trong mục tiêu 65–75%. |
| Mobile | Performance | Góc nhìn xuống capo, bề ngang xe khoảng **74.38%**; toàn bộ phần đầu vẫn rõ. |
| Mobile | Precision | Toàn bộ silhouette sau-trái nằm trong khung; NDC ngang `[-0.970, 0.978]`, giữ khoảng hở hai mép và tách khỏi copy phía dưới. |
| Mobile | Explore | Toàn xe nằm gọn, bề ngang khoảng **79.43%**, có khoảng trống đều quanh xe. |

## Bổ sung — Digital Cluster

- Desktop: `position [0.37, 1.04, -0.24] → [0.58, 1.05, -0.29]`, `target [0.20, 0.82, 0.45] → [0.10, 0.74, 0.47]`, `fov 38 → 41`.
- Compact/portrait: `position [0.37, 1.02, -0.28] → [0.62, 1.04, -0.36]`, `target [0.37, 0.70, 0.45] → [0.14, 0.56, 0.47]`, `fov 52 → 65`.
- Waypoint `instruments` được dịch sang phải từ `x 0.10 → 0.28` trên desktop và `x 0.08 → 0.28` trên compact, đồng thời lùi nhẹ theo trục Z để chuyển động từ Steering không dồn vào nửa sau.
- Khung cuối giữ vô-lăng và cụm đồng hồ làm ngữ cảnh, đồng thời đưa màn hình trung tâm cùng center stack vào vùng nhìn rõ. Đã kiểm tra tại `1440 × 900`, `768 × 1024`, `390 × 844` và `844 × 390`, cùng khung giữa transition Steering → Digital Cluster.

## Bổ sung — Rear Signature và đường lia vào cabin

- Cảnh số `04` nằm sau Aerodynamics và nhìn thẳng chính diện đuôi xe. Desktop dùng `position [-0.85, 0.78, -7.35]`, `target [-0.85, 0.58, -2.15]`, `fov 33`; compact dùng `position [0.00, 0.72, -8.15]`, `target [0.00, 0.15, -2.15]`, `fov 52`; mobile ngang dùng override `position [-1.40, 0.66, -6.40]`, `target [-1.40, 0.62, -2.00]`, `fov 31`.
- Khung hình bao quát trọn cánh gió, bốn đèn hậu tròn, hai bánh sau, bốn đầu pô và diffuser; copy nằm tách khỏi thân xe ở desktop, tablet, mobile dọc và mobile ngang.
- Sau khi hoán đổi hai cảnh đầu/cuối, mạch chính chạy theo thứ tự Explore → Performance → Aerodynamics → Rear Signature → Precision, đi tiếp vào nội thất và kết ở Hero. Hai đoạn mới Explore → Performance và Rear Seat Detail → Hero dùng quỹ đạo cong riêng để tránh gãy hướng hoặc xuyên qua cánh gió.
- Waypoint desktop lần lượt là `[2.75, 3.60, 7.90]`, `[4.50, 3.50, 5.80]`, `[8.50, 2.80, -7.00]`, `[-3.15, 1.00, -6.55]`; compact dùng `[6.60, 4.75, 10.20]`, `[10.40, 5.10, 7.30]`, `[8.00, 3.50, -10.50]`, `[-4.20, 1.30, -8.00]`.
- Audit trên toàn bộ `300.735` vertices xác nhận các transition ngoại thất không xuyên mesh, không chạm near plane và không có crop bất thường ở khung giữa. Các điểm dừng Rear Signature và Precision đều giữ trọn xe trong viewport chuẩn.
- Waypoint vào Cockpit được tinh chỉnh thành `[-0.24, 1.40, -2.60]` trên desktop và `[-0.18, 1.45, -2.60]` trên compact. Camera đi từ cửa kính sau, qua khe giữa hai ghế trước rồi dừng ở shot Cockpit. Vì GLB là một vỏ xe kín, hai material kính được fade có kiểm soát đúng trong khoảng camera băng qua kính; quỹ đạo đã được đo để không xuyên trụ, dashboard, gương hoặc lưng ghế.
- Đoạn Rear Seat Detail → Explore đi qua shot Interior, waypoint ngoài kính sau nói trên, rồi mới trở lại góc ngoại thất. Cùng một timeline và fade kính được đánh giá ngược khi cuộn lên, nên cả hai chiều đều giữ quỹ đạo an toàn.
- Audit coverage xác nhận center console đã hiện trong Cockpit, Digital Cluster và Front Seats nên không cần thêm section trùng nội dung. Khoang máy không thể lộ chỉ bằng camera vì mesh capo của GLB đang đóng và model không có animation mở nắp; đây là giới hạn trạng thái model, không phải góc camera bị bỏ sót.

## Kiểm tra chuyển động

- Master GSAP ScrollTrigger timeline vẫn là writer duy nhất của story camera.
- Mỗi chặng vẫn tween `rig.target` liên tục trong toàn bộ duration, không chỉ tween `position`.
- `fov` tiếp tục tween đồng bộ với position/target.
- Waypoint `instruments`, vòng ngoại thất một chiều qua Rear Signature và Precision, cùng waypoint đi vào Cockpit là các waypoint được tinh chỉnh trong lượt bổ sung này.
- Không thêm animation camera riêng cho chiều cuộn ngược; cuộn lên đánh giá ngược chính timeline hiện tại.
- Không có CSS transform để giả dịch model và không thay đổi model scale giữa các section.
- Explore vẫn dùng chính shot cuối khi vào/thoát, không reset scroll về đầu trang.
