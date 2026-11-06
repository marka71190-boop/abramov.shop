"use client";

export function PrintButton({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button type="button" onClick={() => window.print()} style={{ padding: "8px 16px", fontSize: 15, cursor: "pointer" }}>
        Печать ({count})
      </button>
      <span style={{ color: "#555", fontSize: 13 }}>В настройках печати: масштаб 100 %, без полей, размер бумаги — как у этикетки.</span>
    </div>
  );
}
