# Báo cáo tinh chỉnh camera — NORKA R35

## Phạm vi

Camera được tinh chỉnh trực quan tại đúng hai viewport:

- Desktop: **1440 × 900**
- Mobile: **390 × 844**

Không thay model, normalization transform, scale model, CSS transform, lighting, waypoints, GSAP timeline hay kiến trúc scene. Trong mã runtime 3D, chỉ các giá trị `position`, `target` và `fov` trong `desktopShots` và `mobileShots` của `src/three/cameraShots.ts` được thay đổi; các thay đổi còn lại chỉ phục vụ workflow Yarn và tài liệu bàn giao.

Debug HUD phát triển vẫn được bật/tắt bằng phím **D** và nút **Copy shot** tiếp tục xuất object hợp lệ. Các tọa độ tốt nhất đã được lưu trực tiếp vào source.

## Desktop — before/after

| Section | Position trước | Position sau | Target trước | Target sau | FOV trước → sau |
|---|---|---|---|---|---:|
| Hero | `[-4.60, 1.75, 5.70]` | `[-7.15, 1.72, 7.45]` | `[0.00, 0.55, 0.75]` | `[-2.45, 0.47, 0.68]` | `32 → 31.5` |
| Aerodynamics | `[4.80, 1.20, 0.35]` | `[9.10, 1.30, -0.75]` | `[0.00, 0.52, 0.00]` | `[0.00, 0.42, -1.10]` | `30 → 32` |
| Performance | `[1.80, 3.80, 3.50]` | `[1.40, 4.90, 6.50]` | `[0.00, 0.70, 1.05]` | `[-0.90, 0.55, 1.30]` | `28 → 30` |
| Precision | `[-2.30, 0.72, 2.30]` | `[-3.40, 1.25, 5.30]` | `[-0.82, 0.38, 1.55]` | `[0.35, 0.45, 2.05]` | `26 → 29` |
| Explore | `[4.70, 1.80, 5.30]` | `[3.20, 1.90, 7.30]` | `[0.00, 0.55, 0.00]` | `[-1.40, 0.50, 1.25]` | `34 → 36.5` |

## Mobile — before/after

| Section | Position trước | Position sau | Target trước | Target sau | FOV trước → sau |
|---|---|---|---|---|---:|
| Hero | `[-5.50, 2.00, 7.40]` | `[-7.30, 2.15, 8.95]` | `[0.00, 0.58, 0.78]` | `[-0.30, 0.15, 0.50]` | `38 → 53` |
| Aerodynamics | `[6.70, 1.45, 0.55]` | `[16.50, 1.90, 0.55]` | `[0.00, 0.57, 0.05]` | `[0.00, 0.38, 0.05]` | `39 → 50` |
| Performance | `[2.90, 4.90, 5.55]` | `[4.15, 7.10, 9.35]` | `[0.00, 0.72, 1.00]` | `[0.15, 0.12, 0.85]` | `38 → 53` |
| Precision | `[-3.45, 0.92, 3.50]` | `[-6.80, 1.70, 7.20]` | `[-0.78, 0.40, 1.48]` | `[-0.50, 0.18, 1.40]` | `36 → 49` |
| Explore | `[6.35, 2.15, 7.25]` | `[8.50, 2.40, 9.80]` | `[0.00, 0.57, 0.00]` | `[0.00, 0.10, 0.00]` | `40 → 54` |

## Kết quả bố cục đã đo

| Viewport | Section | Kết quả |
|---|---|---|
| Desktop | Hero | Toàn bộ xe ở góc trước 3/4; bề ngang xe khoảng **55.49%** viewport; cản trước và bánh trước không bị cắt; xe nằm bên phải vùng copy. |
| Desktop | Aerodynamics | Thân xe khoảng **67.58%** chiều ngang viewport, nằm trong mục tiêu 65–75%. |
| Desktop | Performance | Góc nhìn từ trên xuống vùng capo; capo, đèn, cản và toàn bộ phần đầu vẫn nhận diện rõ. |
| Desktop | Precision | Mâm/phanh trước là điểm chính; phần đầu, cabin và một phần thân xe vẫn giữ đủ ngữ cảnh. |
| Desktop | Explore | Toàn xe nằm gọn; bề ngang khoảng **50.71%** viewport, có khoảng thở trước khi bật OrbitControls. |
| Mobile | Hero | Toàn xe nằm trong khung, cản trước còn khoảng trống; text bắt đầu phía dưới thân xe. |
| Mobile | Aerodynamics | Thân xe khoảng **73.94%** chiều ngang viewport, nằm trong mục tiêu 65–75%. |
| Mobile | Performance | Góc nhìn xuống capo, bề ngang xe khoảng **74.38%**; toàn bộ phần đầu vẫn rõ. |
| Mobile | Precision | Mâm/phanh trước chiếm ưu thế; phần đầu và đủ chiều dài thân xe còn lại để hiểu vị trí chi tiết. |
| Mobile | Explore | Toàn xe nằm gọn, bề ngang khoảng **79.43%**, có khoảng trống đều quanh xe. |

## Kiểm tra chuyển động

- Master GSAP ScrollTrigger timeline vẫn là writer duy nhất của story camera.
- Mỗi chặng vẫn tween `rig.target` liên tục trong toàn bộ duration, không chỉ tween `position`.
- `fov` tiếp tục tween đồng bộ với position/target.
- Desktop/mobile waypoints không bị thay đổi.
- Không thêm animation camera riêng cho chiều cuộn ngược; cuộn lên đánh giá ngược chính timeline hiện tại.
- Không có CSS transform để giả dịch model và không thay đổi model scale giữa các section.
- Explore vẫn dùng chính shot cuối khi vào/thoát, không reset scroll về đầu trang.
