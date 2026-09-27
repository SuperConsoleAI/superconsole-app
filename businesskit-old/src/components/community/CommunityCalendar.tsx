import { component$, useSignal, $, useStylesScoped$, PropFunction } from "@builder.io/qwik";
import { LuPlus, LuList, LuCalendar } from "@qwikest/icons/lucide";

const STYLES = `
  .cal-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border-radius: 0.85rem;
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .cal-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 1rem;
  }
  .cal-btn {
    padding: 0.4rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cal-btn:hover {
    background: var(--surface-3);
  }
  .cal-nav-group {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .cal-nav-arrows {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
  }
  .cal-nav-arrow {
    cursor: pointer;
    padding: 0.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
  }
  .cal-nav-arrow:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }
  .cal-month-info {
    text-align: center;
    display: flex;
    flex-direction: column;
  }
  .cal-month-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .cal-month-sub {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .cal-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icon-btn {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  .icon-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }
  .icon-btn.active {
    background: var(--border);
    color: var(--text-primary);
  }
  .toggle-group {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .toggle-btn {
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .toggle-btn.active {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    background: var(--border);
    gap: 1px;
    border-bottom: 1px solid var(--border);
  }
  .cal-dow {
    background: var(--surface-2);
    padding: 1rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    text-align: center;
    color: var(--text-primary);
  }
  .cal-cell {
    background: var(--surface-2);
    min-height: 120px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .cal-cell.other-month {
    background: var(--surface-2);
    opacity: 0.6;
  }
  .cal-day-num {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }
  .cal-day-num.today {
    color: var(--accent);
    font-weight: 700;
  }

  .event-chip {
    background: var(--surface-2);
    color: var(--accent);
    border-radius: 0.25rem;
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: opacity 0.1s;
    border-left: 3px solid var(--accent);
  }
  .event-chip:hover {
    opacity: 0.85;
  }
  .event-chip.type-highlight {
    background: var(--accent);
    color: #fff;
    border-left: none;
  }

  .cal-more {
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding-left: 0.25rem;
  }
  .cal-more:hover {
    color: var(--accent);
  }
`;

const getLocalYYYYMMDD = (d: Date) => {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

function buildCalendar(year: number, month: number, events: any[]) {
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean; events: any[] }[] = [];

  // Prev month padding (start from Sunday or Monday based on preference, here Sunday = 0)
  // Let's assume Monday is first day like in the image (Mon-Sun)
  let adjustedFirstDay = firstDay - 1;
  if (adjustedFirstDay < 0) adjustedFirstDay = 6; // Sunday becomes 6

  for (let i = adjustedFirstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false, events: [] });
  }
  // Current month
  for (let d = 1; d <= daysInMon; d++) {
    const date  = new Date(year, month, d);
    const dayStr = getLocalYYYYMMDD(date);
    const dayEvents = events.filter((e: any) => {
      const startsAt = getLocalYYYYMMDD(new Date(e.startsAt * 1000));
      return startsAt === dayStr;
    });
    cells.push({ date, isCurrentMonth: true, events: dayEvents });
  }
  // Next month padding to fill last row
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, next++), isCurrentMonth: false, events: [] });
  }
  return cells;
}

const DOW_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CommunityCalendarProps {
  events: any[];
  onAddEvent$?: PropFunction<() => void>;
}

export const CommunityCalendar = component$<CommunityCalendarProps>(({ events, onAddEvent$ }) => {
  useStylesScoped$(STYLES);

  const now   = new Date();
  const viewYear  = useSignal(now.getFullYear());
  const viewMonth = useSignal(now.getMonth());
  const viewType  = useSignal<"month" | "list">("month");

  const cells = buildCalendar(viewYear.value, viewMonth.value, events);
  const monthLabel = new Date(viewYear.value, viewMonth.value, 1)
    .toLocaleString("en", { month: "long", year: "numeric" });

  const prevMonth = $(() => {
    if (viewMonth.value === 0) { viewYear.value--; viewMonth.value = 11; }
    else viewMonth.value--;
  });
  const nextMonth = $(() => {
    if (viewMonth.value === 11) { viewYear.value++; viewMonth.value = 0; }
    else viewMonth.value++;
  });
  const goToday = $(() => {
    viewYear.value = now.getFullYear();
    viewMonth.value = now.getMonth();
  });

  const todayKey = getLocalYYYYMMDD(now);

  return (
    <div class="cal-container">
      <div class="cal-header-bar">
        <button class="cal-btn" onClick$={goToday}>Today</button>

        <div class="cal-nav-group">
          <div class="cal-nav-arrow" onClick$={prevMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </div>
          <div class="cal-month-info">
            <span class="cal-month-title">{monthLabel}</span>
            <span class="cal-month-sub">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
          </div>
          <div class="cal-nav-arrow" onClick$={nextMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        </div>

        <div class="cal-actions">
          {onAddEvent$ && (
            <button 
              class="icon-btn" 
              onClick$={onAddEvent$} 
              title="Add Event"
              style="background: var(--button-primary-bg, var(--accent)); color: var(--button-primary-text, #fff); border: none;"
            >
              <LuPlus style="width: 1.25rem; height: 1.25rem;" />
            </button>
          )}
          <div class="toggle-group">
            <button 
              class={`toggle-btn ${viewType.value === 'list' ? 'active' : ''}`}
              onClick$={() => viewType.value = 'list'}
              title="List View"
            >
              <LuList style="width: 1.1rem; height: 1.1rem;" />
            </button>
            <button 
              class={`toggle-btn ${viewType.value === 'month' ? 'active' : ''}`}
              onClick$={() => viewType.value = 'month'}
              title="Month View"
            >
              <LuCalendar style="width: 1.1rem; height: 1.1rem;" />
            </button>
          </div>
        </div>
      </div>

      {viewType.value === "month" ? (
        <div class="calendar-grid">
          {DOW_MON.map((d) => <div class="cal-dow" key={d}>{d}</div>)}
          {cells.map((cell, i) => {
            const cellKey  = getLocalYYYYMMDD(cell.date);
            const isToday  = cellKey === todayKey;
            const visible  = cell.events.slice(0, 3);
            const overflow = cell.events.length - visible.length;
            return (
              <div
                key={i}
                class={`cal-cell${!cell.isCurrentMonth ? " other-month" : ""}`}
              >
                <div class={`cal-day-num${isToday ? " today" : ""}`}>{cell.date.getDate()}</div>
                {visible.map((e: any) => {
                  const evtDate = new Date(e.startsAt * 1000);
                  const timeStr = evtDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
                  return (
                    <div
                      key={e.id}
                      class={`event-chip ${e.eventType === 'hybrid' ? 'type-highlight' : ''}`}
                      title={e.title}
                    >
                      <span style="opacity: 0.8; font-weight: 500;">{timeStr} -</span> {e.title}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div class="cal-more">+{overflow} more</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style="padding: 2rem;">
          {/* Simple list view placeholder */}
          {events.length === 0 ? (
            <div style="color: var(--text-secondary); text-align: center; padding: 3rem;">No events scheduled.</div>
          ) : (
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              {events.map((e: any) => {
                const dateObj = new Date(e.startsAt * 1000);
                return (
                  <div key={e.id} style="display: flex; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; gap: 1.5rem; background: var(--surface-2);">
                    <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                      <span style="font-size: 0.8rem; text-transform: uppercase; color: var(--accent); font-weight: 700;">{dateObj.toLocaleString('default', { month: 'short' })}</span>
                      <span style="font-size: 1.5rem; font-weight: 700;">{dateObj.getDate()}</span>
                    </div>
                    <div>
                      <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">{e.title}</div>
                      <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">{dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {e.duration || '1 hour'}</div>
                      {e.description && <div style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">{e.description}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
