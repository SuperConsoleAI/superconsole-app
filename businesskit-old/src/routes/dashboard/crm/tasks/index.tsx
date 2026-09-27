import { component$, $, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";

import { AddTask } from "~/components/crm/AddTask";
import type { TaskRow, ContactRow } from "~/lib/types";

const TASKS_STYLES = `
  .tasks-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }
  @media (max-width: 768px) {
    .tasks-main {
    }
  }
  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .btn-primary {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    padding: 0 1rem;
    height: 2rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .filters-bar {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .filter-select {
    padding: 0 2rem 0 0.75rem;
    height: 2rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    box-sizing: border-box;
    font-size: 0.875rem;
    appearance: none;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    background-size: 1rem;
  }
  .task-list {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    overflow-x: auto;
  }
  .task-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s ease;
    min-width: 600px;
  }
  .task-row:last-child {
    border-bottom: none;
  }
  .task-row:hover {
    background: var(--surface);
  }
  .task-checkbox {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
    cursor: pointer;
    flex-shrink: 0;
  }
  .task-title {
    font-weight: 500;
    color: var(--text-primary);
    flex: 1;
  }
  .task-done {
    text-decoration: line-through;
    color: var(--text-secondary);
  }
  .task-contact {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    width: 200px;
  }
  .task-due {
    color: var(--text-secondary);
    font-size: 0.875rem;
    width: 120px;
    text-align: right;
  }
  .priority-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
    width: 60px;
    text-align: center;
  }
  .priority-high { background: var(--error-soft, #fee2e2); color: var(--error, #dc2626); }
  .priority-medium { background: #fef9c3; color: #a16207; }
  .priority-low { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
`;

export default component$(() => {
  useStylesScoped$(TASKS_STYLES);
  
  const tasks = useSignal<TaskRow[]>([]);
  const contactsMap = useSignal<Record<string, ContactRow>>({});
  const loading = useSignal(true);

  const isAddOpen = useSignal(false);

  const priorityFilter = useSignal("");
  const statusFilter = useSignal("open"); // Default to open tasks

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    loading.value = true;
    try {
      const [tasksData, contactsRaw] = await Promise.all([
        invoke<TaskRow[]>('list_tasks', { contactId: null, status: null }),
        invoke<ContactRow[]>('list_contacts', { opts: { limit: 1000 } })
      ]);
      tasks.value = tasksData || [];
      const map: Record<string, ContactRow> = {};
      (contactsRaw || []).forEach(c => { map[c.id] = c; });
      contactsMap.value = map;
    } catch (err) {
      console.error("Failed to load tasks:", err);
    } finally {
      loading.value = false;
    }
  });

  const filteredTasks = tasks.value.filter((t: TaskRow) => {
    if (priorityFilter.value && t.priority !== priorityFilter.value) return false;
    if (statusFilter.value && t.status !== statusFilter.value) return false;
    return true;
  });

  const handleToggle$ = $(async (taskId: string, currentStatus: string) => {
    if (currentStatus === 'done') {
      // Re-opening is not explicitly supported by our backend yet, so we just return.
      return;
    }

    const currentTasks = [...tasks.value];
    const index = currentTasks.findIndex(t => t.id === taskId);
    if (index > -1) {
      // Optimistically update
      currentTasks[index] = { ...currentTasks[index], status: 'done' };
      tasks.value = currentTasks;

      try {
        await invoke('complete_task', { taskId });
      } catch (err) {
        console.error("Failed to complete task:", err);
        // revert on failure
        window.location.reload();
      }
    }
  });

  return (
    <div style="display: flex; min-height: 100vh; background: var(--background);">
      <div class="tasks-main">
        <div class="header-actions" style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap; width: 100%;">
          <div style="display: flex; gap: 0.5rem; flex: 1;">
            <select class="filter-select" value={statusFilter.value} onChange$={(e) => statusFilter.value = (e.target as HTMLSelectElement).value}>
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
            <select class="filter-select" value={priorityFilter.value} onChange$={(e) => priorityFilter.value = (e.target as HTMLSelectElement).value}>
              <option value="">All Priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button class="btn-primary" style="white-space: nowrap;" onClick$={() => isAddOpen.value = true}>
            + Add Task
          </button>
        </div>

        {loading.value ? (
          <div style="text-align:center;padding:3rem;color:var(--text-secondary);">Loading...</div>
        ) : (
          <div class="task-list">
            {filteredTasks.length === 0 ? (
              <div style="text-align:center;padding:3rem 1rem;color:var(--text-secondary);">
                No tasks match your filters.
              </div>
            ) : (
              filteredTasks.map((t: TaskRow) => {
                const contact = t.contact_id ? contactsMap.value[t.contact_id] : null;
                const isDone = t.status === 'done';
                return (
                  <div class="task-row" key={t.id}>
                    <input 
                      type="checkbox" 
                      class="task-checkbox" 
                      checked={isDone}
                      onChange$={() => handleToggle$(t.id, t.status)}
                    />
                    <div class={`priority-badge priority-${t.priority || 'medium'}`}>
                      {t.priority || 'medium'}
                    </div>
                    <div class={`task-title ${isDone ? 'task-done' : ''}`}>
                      {t.title}
                    </div>
                    <div class="task-contact">
                      {contact && (
                        <span style="display:inline-block;width:1.5rem;height:1.5rem;border-radius:50%;background:var(--surface);text-align:center;line-height:1.5rem;font-size:0.75rem;">
                          {(contact.first_name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      {contact ? `${contact.first_name} ${contact.last_name || ''}` : ''}
                    </div>
                    <div class="task-due">
                      {t.due_at ? new Date((t.due_at as number) * 1000).toLocaleDateString() : 'No due date'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      <AddTask 
        isOpen={isAddOpen.value} 
        onClose$={$(() => isAddOpen.value = false)} 
        contacts={Object.values(contactsMap.value)}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Tasks - CRM",
};
