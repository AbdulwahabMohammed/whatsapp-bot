🔹 file: src/worker.js
🧩 line: 63
💬 comment: **Suggestion:** Handle NaN from invalid parsing
```suggestion
  0,
  Math.min(parseInt(process.env.BULK_MESSAGE_DELAY || '500', 10) || 500, 60000)
);
```

<!-- manually_applied -->
