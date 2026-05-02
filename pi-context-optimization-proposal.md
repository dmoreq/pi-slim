# Proposal: Advanced Context Optimization for Pi-Coding-Agent

**Status:** Draft / Conceptual
**Author:** Albert Doan
**Target:** Developers & AI Engineering Teams

---

## 1. Tổng quan (Overview)
Tài liệu này đề xuất một giải pháp toàn diện nhằm nâng cấp khả năng xử lý ngữ cảnh của `pi-coding-agent`. Mục tiêu là giảm chi phí API, tăng tốc độ phản hồi và cải thiện độ chính xác của mã nguồn được tạo ra thông qua kiến trúc Hybrid (TypeScript + Rust).

## 2. Vấn đề hiện tại (Current Challenges)
- **Token Waste:** Đọc toàn bộ nội dung file gây lãng phí 80% cửa sổ ngữ cảnh cho những phần mã nguồn không liên quan.
- **Context Hallucination:** Agent không hiểu được mối quan hệ giữa các file (Dependency) dẫn đến việc sử dụng sai API nội bộ.
- **Output Inefficiency:** In lại toàn bộ tệp tin khi chỉ cần sửa 1 dòng code làm tăng đáng kể độ trễ và chi phí.

## 3. Giải pháp đề xuất (Proposed Solutions)

### A. Kiến trúc Hybrid Performance
- **Engine:** Sử dụng `napi-rs` để nhúng các module Rust vào Pi Extension.
- **Nhiệm vụ:** Rust xử lý Parsing (Tree-sitter) và Graph xử lý nhanh, TypeScript điều phối UI/UX.

### B. AST-based Repo Mapping
- **Cơ chế:** Trích xuất "Skeleton" của toàn bộ dự án (chỉ lấy chữ ký hàm, class, struct).
- **Kết quả:** Cung cấp cho LLM một bản đồ toàn dự án với lượng token cực thấp.

### C. Đồ thị Phụ thuộc (Dependency Graph)
- **Cơ chế:** Dựng đồ thị `petgraph` từ các câu lệnh import.
- **Tác dụng:** Tự động tiêm (inject) các file liên quan cấp 1 vào ngữ cảnh khi chỉnh sửa mã nguồn.

### D. Tối ưu Output (Search/Replace Blocks)
- **Cơ chế:** Buộc LLM trả về định dạng Diff tối giản thay vì mã nguồn thô.
- **Lợi ích:** Giảm 90% lượng token đầu ra và giảm thiểu lỗi do LLM "lười" in code.

## 4. Lợi ích dự kiến (Expected Benefits)
- **Cost Reduction:** Tiết kiệm ~60-70% tổng chi phí API hàng tháng.
- **Speed:** Thời gian xử lý ngữ cảnh giảm xuống mức mili-giây nhờ Rust.
- **Accuracy:** Tăng tỷ lệ code chạy được ngay (first-time pass rate) nhờ ngữ cảnh chính xác.

## 5. Kế hoạch triển khai (Roadmap)
1. **Phase 1:** Phát triển lõi Rust Parser với Tree-sitter.
2. **Phase 2:** Xây dựng hệ thống Patcher cho Search/Replace blocks.
3. **Phase 3:** Tích hợp RAG cục bộ (LanceDB) để tìm kiếm ngữ nghĩa.

---
*Tài liệu này được soạn thảo bởi Albert Doan. Mọi ý đóng góp xin vui lòng tạo Issue hoặc Pull Request.*
