"use client";

import "./participation-plan.css";
import { useId, useState } from "react";
import { CheckSquare2, Plus, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { maxParticipationTasks, participationStages, type ParticipationPlan } from "@/lib/model";

export function ParticipationPlanEditor({
  plan,
  onChange,
  onDraftChange,
}: {
  plan?: ParticipationPlan;
  onChange: (plan: ParticipationPlan | null) => boolean;
  onDraftChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const [task, setTask] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const done = plan?.tasks.filter((task) => task.done).length ?? 0;
  return (
    <section className="participation-plan" aria-label="Private participation plan">
      <div className="plan-heading">
        <h3>
          <CheckSquare2 size={16} /> Participation <span className="text-highlight">plan</span>
        </h3>
        {plan && (
          <span>
            {done}/{plan.tasks.length} tasks done
          </span>
        )}
      </div>
      <p className="plan-privacy">
        Your progress and tasks stay private and are not sent to AI. Marking Submitted does not
        enter a competition.
      </p>
      {!plan ? (
        <Button variant="outline" onClick={() => onChange({ stage: "Interested", tasks: [] })}>
          Start tracking
        </Button>
      ) : (
        <>
          <label className="plan-stage" htmlFor={`${id}-stage`}>
            Your progress
            <select
              id={`${id}-stage`}
              value={plan.stage}
              onChange={(event) => {
                const stage = participationStages.find((stage) => stage === event.target.value);
                if (stage) onChange({ ...plan, stage });
              }}
            >
              {participationStages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          {plan.tasks.length > 0 && (
            <ul className="plan-tasks">
              {plan.tasks.map((task) => (
                <li key={task.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() =>
                        onChange({
                          ...plan,
                          tasks: plan.tasks.map((other) =>
                            other.id === task.id ? { ...other, done: !other.done } : other,
                          ),
                        })
                      }
                    />
                    <span className={task.done ? "task-done" : ""}>{task.text}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove task: ${task.text}`}
                    onClick={() =>
                      onChange({
                        ...plan,
                        tasks: plan.tasks.filter((other) => other.id !== task.id),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="plan-task-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!task.trim() || plan.tasks.length >= maxParticipationTasks) return;
              if (
                onChange({
                  ...plan,
                  tasks: [
                    ...plan.tasks,
                    { id: crypto.randomUUID(), text: task.trim(), done: false },
                  ],
                })
              ) {
                setTask("");
                onDraftChange(false);
              }
            }}
          >
            <label htmlFor={`${id}-task`}>New task</label>
            <div>
              <input
                id={`${id}-task`}
                value={task}
                maxLength={200}
                placeholder="e.g. Read the eligibility rules"
                disabled={plan.tasks.length >= maxParticipationTasks}
                onChange={(event) => {
                  setTask(event.target.value);
                  onDraftChange(Boolean(event.target.value.trim()));
                }}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!task.trim() || plan.tasks.length >= maxParticipationTasks}
              >
                <Plus size={14} /> Add task
              </Button>
            </div>
            {plan.tasks.length >= maxParticipationTasks && (
              <p>Up to {maxParticipationTasks} tasks per listing. Remove one to add another.</p>
            )}
          </form>
          {confirmRemove ? (
            <div
              className="plan-remove-confirm"
              role="group"
              aria-label="Confirm removal of participation plan"
            >
              <p>Remove this plan and all its tasks? Your bookmark and note will stay.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmRemove(false)}
              >
                Keep plan
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (onChange(null)) {
                    setTask("");
                    onDraftChange(false);
                    setConfirmRemove(false);
                  }
                }}
              >
                Remove plan and tasks
              </Button>
            </div>
          ) : (
            <button className="remove-plan" type="button" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={12} /> Remove plan
            </button>
          )}
        </>
      )}
    </section>
  );
}
