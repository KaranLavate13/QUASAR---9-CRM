import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Play,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  TaskItem,
  TaskPriority,
  TaskStatus,
  UserPublicProfile,
} from '../types/crm';
import { formatTimestamp } from '../utils/crmLogic';

interface TasksWorkspaceViewProps {
  tasks: TaskItem[];
  employees: UserPublicProfile[];
  currentProfile: UserPublicProfile | null;
  currentEmail: string;
  onCreateTask: (payload: {
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate: string;
    relatedDealTitle: string;
  }) => Promise<void>;
  onUpdateTaskStatus: (task: TaskItem, status: TaskStatus) => Promise<void>;
  onDeleteTask: (task: TaskItem) => Promise<void>;
  onOpenProfile: () => void;
}

export const TasksWorkspaceView: React.FC<TasksWorkspaceViewProps> = ({
  tasks,
  employees,
  currentProfile,
  currentEmail,
  onCreateTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onOpenProfile,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [relatedDealTitle, setRelatedDealTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'pending'), [tasks]);
  const workingTasks = useMemo(() => tasks.filter((t) => t.status === 'working'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === 'completed'), [tasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Enter a clear task title.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onCreateTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        dueDate: dueDate.trim(),
        relatedDealTitle: relatedDealTitle.trim(),
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      setRelatedDealTitle('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to add task.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Array<{ id: TaskStatus; label: string; items: TaskItem[] }> = [
    { id: 'pending', label: 'Pending', items: pendingTasks },
    { id: 'working', label: 'Working', items: workingTasks },
    { id: 'completed', label: 'Completed', items: completedTasks },
  ];

  const visibleColumns =
    statusFilter === 'all' ? columns : columns.filter((c) => c.id === statusFilter);

  return (
    <div className="space-y-6">
      {/* Subtitle & action strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Track your working, pending, and completed tasks. Marking any task Completed automatically posts it to the Home Feed.
        </p>
        <button
          type="button"
          onClick={onOpenProfile}
          className="rounded-xl px-4 py-2 text-xs font-medium liquid-surface hover:opacity-90"
        >
          Edit Employee Profile
        </button>
      </div>

      {/* Employee Info Card + Workload Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="liquid-surface flex items-center gap-4 rounded-2xl p-5 lg:col-span-2">
          {currentProfile?.photoUrl ? (
            <img
              src={currentProfile.photoUrl}
              alt={currentProfile.displayName}
              referrerPolicy="no-referrer"
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {(currentProfile?.displayName || 'G').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">
              {currentProfile?.displayName || 'Guest Workspace Session'}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{currentProfile?.roleTitle || 'No role set yet'}</span>
              <span aria-hidden="true">·</span>
              <span>{currentProfile?.department || 'General'}</span>
              {currentEmail && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{currentEmail}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="liquid-surface grid grid-cols-3 divide-x rounded-2xl p-5 text-center" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="text-xl font-bold font-mono-tabular">{workingTasks.length}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Working</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono-tabular">{pendingTasks.length}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Pending</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono-tabular text-emerald-500">{completedTasks.length}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Completed</div>
          </div>
        </div>
      </div>

      {/* Add Task Form */}
      <form onSubmit={handleSubmit} className="liquid-surface rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor="task-title-input" className="sr-only">Task title</label>
            <input
              id="task-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task title (e.g., Prepare Q4 renewal proposal)..."
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus-visible:ring-2"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="task-priority-select" className="sr-only">Task priority</label>
            <select
              id="task-priority-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent Priority</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="task-due-date" className="sr-only">Due date</label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="task-desc-input" className="sr-only">Task notes</label>
            <input
              id="task-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description or deliverable checklist..."
              className="w-full rounded-xl px-4 py-2 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
          </div>
          <div>
            <label htmlFor="task-deal-input" className="sr-only">Linked CRM deal</label>
            <input
              id="task-deal-input"
              type="text"
              value={relatedDealTitle}
              onChange={(e) => setRelatedDealTitle(e.target.value)}
              placeholder="Optional linked CRM deal or account..."
              className="w-full rounded-xl px-4 py-2 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            />
          </div>
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
      </form>

      {/* Filter Bar (80% transparent liquid glass when active) */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Task status filter">
        {(
          [
            { id: 'all', label: `All (${tasks.length})` },
            { id: 'working', label: `Working (${workingTasks.length})` },
            { id: 'pending', label: `Pending (${pendingTasks.length})` },
            { id: 'completed', label: `Completed (${completedTasks.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-medium whitespace-nowrap transition-all ${
              statusFilter === tab.id ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3-Column Task Board: Pending / Working / Completed */}
      <div className={`grid grid-cols-1 gap-4 ${visibleColumns.length === 1 ? 'max-w-2xl' : 'lg:grid-cols-3'}`}>
        {visibleColumns.map((col) => (
          <div key={col.id} className="liquid-surface rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                {col.items.length}
              </span>
            </div>

            {col.items.length === 0 ? (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No {col.label.toLowerCase()} tasks
              </div>
            ) : (
              <div className="space-y-3">
                {col.items.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl p-4 space-y-3"
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${task.status === 'completed' ? 'line-through opacity-75' : ''}`}>
                          {task.title}
                        </div>
                        {task.description && (
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {task.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(task)}
                        aria-label={`Delete task ${task.title}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      <span className="capitalize">{task.priority}</span>
                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Due {task.dueDate}</span>
                        </>
                      )}
                      {task.relatedDealTitle && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{task.relatedDealTitle}</span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {task.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => onUpdateTaskStatus(task, 'working')}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium liquid-surface hover:opacity-90"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Start Working
                        </button>
                      )}
                      {task.status === 'working' && (
                        <button
                          type="button"
                          onClick={() => onUpdateTaskStatus(task, 'pending')}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium liquid-surface hover:opacity-90"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Pause to Pending
                        </button>
                      )}
                      {task.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => onUpdateTaskStatus(task, 'completed')}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark Completed
                        </button>
                      )}
                      {task.status === 'completed' && (
                        <span className="text-xs font-mono-tabular text-emerald-500">
                          Completed {formatTimestamp(task.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Real Organization Directory (Zero Fictional Employees) */}
      <div className="liquid-surface rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-semibold">Connected Organization Employees</h2>
          </div>
          <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
            {employees.length} registered
          </span>
        </div>

        {employees.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-xs" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            <UserCheck className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--text-muted)' }} />
            No fictional employees are shown. Employees appear here automatically as soon as they create an account with Google.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((emp) => (
              <div
                key={emp.uid}
                className="flex items-center gap-3 rounded-xl p-3.5"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              >
                {emp.photoUrl ? (
                  <img
                    src={emp.photoUrl}
                    alt={emp.displayName}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {emp.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{emp.displayName}</div>
                  <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                    {emp.roleTitle || 'Team Member'}{emp.department ? ` · ${emp.department}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
