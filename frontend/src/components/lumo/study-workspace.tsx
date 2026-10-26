import { useEffect, useState } from "react";
import { CalendarClock, Check, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "./workspaces";

const modes = { focus: 25 * 60, break: 5 * 60 } as const;
export function StudyWorkspace() {
  const [mode, setMode] = useState<keyof typeof modes>("focus");
  const [left, setLeft] = useState<number>(modes.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [topics, setTopics] = useState<Array<{ id: string; text: string; done: boolean }>>([]);
  const [topic, setTopic] = useState("");
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(
      () =>
        setLeft((l) => {
          if (l > 1) return l - 1;
          setRunning(false);
          if (mode === "focus") setSessions((s) => s + 1);
          return 0;
        }),
      1000,
    );
    return () => window.clearInterval(id);
  }, [running, mode]);
  const switchMode = (m: keyof typeof modes) => {
    setMode(m);
    setLeft(modes[m]);
    setRunning(false);
  };
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="ws-page">
      <WorkspaceHeader eyebrow="Workspace · this visit" title="Study" />
      <div className="study-grid">
        <section className="study-timer" aria-label="Focus timer">
          <div className="segmented">
            {(["focus", "break"] as const).map((m) => (
              <Button
                key={m}
                variant="ghost"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
              >
                {m === "focus" ? "Focus · 25" : "Break · 5"}
              </Button>
            ))}
          </div>
          <div className="study-clock" role="timer" aria-live="off">
            {mm}:{ss}
          </div>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setRunning((r) => !r)} disabled={left === 0}>
              {running ? (
                <>
                  <Pause />
                  Pause
                </>
              ) : (
                <>
                  <Play />
                  Start
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => switchMode(mode)}>
              <RotateCcw />
              Reset
            </Button>
          </div>
          <p className="metadata">
            {sessions} focus session{sessions === 1 ? "" : "s"} completed this visit
          </p>
        </section>
        <section className="study-topics" aria-label="Topics">
          <h2>Topics</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!topic.trim()) return;
              setTopics((t) => [
                ...t,
                { id: crypto.randomUUID(), text: topic.trim(), done: false },
              ]);
              setTopic("");
            }}
          >
            <input
              className="text-input"
              aria-label="New topic"
              placeholder="Add a topic to review"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={120}
            />
            <Button type="submit" size="icon" aria-label="Add topic" disabled={!topic.trim()}>
              <Plus />
            </Button>
          </form>
          {topics.length ? (
            <ul>
              {topics.map((t) => (
                <li key={t.id} className={t.done ? "done" : ""}>
                  <button
                    type="button"
                    aria-pressed={t.done}
                    aria-label={`Mark ${t.text} ${t.done ? "not done" : "done"}`}
                    onClick={() =>
                      setTopics((ts) =>
                        ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                  >
                    {t.done && <Check size={12} />}
                  </button>
                  <span>{t.text}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${t.text}`}
                    onClick={() => setTopics((ts) => ts.filter((x) => x.id !== t.id))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="metadata">No topics yet. Topics last for this visit only.</p>
          )}
        </section>
        <section className="study-planner">
          <CalendarClock />
          <div>
            <strong>Smart Study Planner</strong>
            <span className="preview-chip">Coming later</span>
            <p>
              Schedules, spaced repetition, and AI-generated plans are not built yet. Nothing here
              is planned for you automatically.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
