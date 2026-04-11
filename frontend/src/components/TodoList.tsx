"use client";

interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface TodoListProps {
  todos: Todo[];
  accentColor: string;
}

export function TodoList({ todos, accentColor }: TodoListProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const pct = Math.round((completed / todos.length) * 100);

  return (
    <div
      className="mx-4 my-2 rounded-lg border p-3 space-y-2"
      style={{ borderColor: `${accentColor}25`, background: `${accentColor}08` }}
      data-testid="todo-list"
    >
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: accentColor }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {pct}%
        </span>
      </div>

      {/* Todo items */}
      <div className="space-y-1">
        {todos.map((todo, i) => (
          <div
            key={i}
            className="flex items-start gap-2"
            data-testid="todo-item"
            data-status={todo.status}
          >
            <StatusIcon status={todo.status} accentColor={accentColor} />
            <span
              className="text-[11px] leading-relaxed"
              style={{
                color:
                  todo.status === "completed"
                    ? "var(--color-muted-foreground)"
                    : "var(--color-foreground)",
                textDecoration: todo.status === "completed" ? "line-through" : "none",
                opacity: todo.status === "completed" ? 0.5 : 1,
              }}
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({
  status,
  accentColor,
}: {
  status: Todo["status"];
  accentColor: string;
}) {
  if (status === "completed") {
    return (
      <span className="mt-0.5 text-[10px] shrink-0" style={{ color: "#22c55e" }}>
        ✓
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        className="mt-1 h-2 w-2 rounded-full shrink-0 animate-pulse"
        style={{ background: accentColor, minWidth: "8px" }}
      />
    );
  }
  return (
    <span
      className="mt-1 h-2 w-2 rounded-full border shrink-0"
      style={{ borderColor: "var(--color-muted-foreground)", minWidth: "8px" }}
    />
  );
}
