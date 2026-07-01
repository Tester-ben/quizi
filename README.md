# Web trắc nghiệm online

Bộ web tĩnh đã nhập sẵn 29 câu từ file Word bạn gửi.

## File chính

- `index.html`: trang chính để up Vercel.
- `quiz.html`: bản sao trang chính, dùng nếu muốn mở theo tên quiz.html.
- `style.css`: giao diện.
- `quiz.js`: xử lý làm bài, đảo đáp án, chấm điểm.
- `quiz-data.js`: ngân hàng câu hỏi.

## Chế độ làm bài

1. **20 câu cố định**: lấy 20 câu đầu tiên, giữ nguyên A/B/C/D.
2. **Theo đề cương**: lấy 20 câu theo thứ tự đề cương và đảo đáp án.
3. **Random 20 câu**: lấy ngẫu nhiên 20 câu trong toàn bộ ngân hàng câu hỏi.

## Cách thêm câu sau này

Mở `quiz-data.js`, thêm object mới theo mẫu:

```js
{
  id: 30,
  code: "C1-THI-xxx",
  question: "Nội dung câu hỏi?",
  options: [
    { id: "A", text: "Đáp án A" },
    { id: "B", text: "Đáp án B" },
    { id: "C", text: "Đáp án C" },
    { id: "D", text: "Đáp án D" }
  ],
  answer: "A"
}
```

Khi bạn gửi đủ 362 câu, chỉ cần cập nhật `quiz-data.js`, app tự chạy theo tổng câu mới.


## Cập nhật

- Chế độ 1 đã đổi thành chọn khoảng câu. Ví dụ nhập 5 đến 45 thì web lấy toàn bộ câu 5 đến 45 để làm, không giới hạn 20 câu.
- Đáp án A/B/C/D vẫn đảo ngẫu nhiên mỗi lần bắt đầu bài.
