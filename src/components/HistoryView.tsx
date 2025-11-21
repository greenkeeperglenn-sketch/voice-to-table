import { useState, useEffect } from 'react';
import { Session, WorkLog } from '../types';
import { getSessions, getLogs, getStats, LogFilters, getDistinctValues } from '../api';
import WorkLogTable from './WorkLogTable';

interface Stats {
  total_tasks: number;
  total_sessions: number;
  total_hours: number;
  tasks_by_type: { task_type: string; count: number }[];
  tasks_by_area: { area: string; count: number }[];
  machine_usage: { machine: string; count: number }[];
  issues: { issue_type: string; count: number }[];
}

export default function HistoryView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [viewMode, setViewMode] = useState<'sessions' | 'logs' | 'stats'>('sessions');

  // Filter states
  const [filters, setFilters] = useState<LogFilters>({});
  const [filterOptions, setFilterOptions] = useState<{
    areas: string[];
    machines: string[];
    staff: string[];
    taskTypes: string[];
  }>({ areas: [], machines: [], staff: [], taskTypes: [] });

  // Load initial data
  useEffect(() => {
    loadData();
    loadFilterOptions();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [sessionsData, logsData, statsData] = await Promise.all([
        getSessions({ limit: 50 }),
        getLogs({ limit: 100 }),
        getStats(),
      ]);
      setSessions(sessionsData);
      setLogs(logsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadFilterOptions() {
    try {
      const [areas, machines, staff, taskTypes] = await Promise.all([
        getDistinctValues('area'),
        getDistinctValues('machine'),
        getDistinctValues('staff'),
        getDistinctValues('task_type'),
      ]);
      setFilterOptions({ areas, machines, staff, taskTypes });
    } catch (err) {
      console.error('Failed to load filter options:', err);
    }
  }

  async function applyFilters() {
    setIsLoading(true);
    try {
      const logsData = await getLogs(filters);
      setLogs(logsData);

      if (filters.date_from || filters.date_to) {
        const statsData = await getStats({
          date_from: filters.date_from,
          date_to: filters.date_to,
        });
        setStats(statsData);
      }
    } catch (err) {
      console.error('Failed to apply filters:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function clearFilters() {
    setFilters({});
    loadData();
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  // Group logs by date
  const logsByDate = logs.reduce((acc, log) => {
    if (!acc[log.date]) {
      acc[log.date] = [];
    }
    acc[log.date].push(log);
    return acc;
  }, {} as Record<string, WorkLog[]>);

  return (
    <div className="space-y-6">
      {/* View Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('sessions')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'sessions'
              ? 'bg-grass-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Sessions
        </button>
        <button
          onClick={() => setViewMode('logs')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'logs'
              ? 'bg-grass-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Logs
        </button>
        <button
          onClick={() => setViewMode('stats')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'stats'
              ? 'bg-grass-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Statistics
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-800 mb-3">Filters</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From Date</label>
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To Date</label>
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Area</label>
            <select
              value={filters.area || ''}
              onChange={e => setFilters(f => ({ ...f, area: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All areas</option>
              {filterOptions.areas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Machine</label>
            <select
              value={filters.machine || ''}
              onChange={e => setFilters(f => ({ ...f, machine: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All machines</option>
              {filterOptions.machines.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Task Type</label>
            <select
              value={filters.task_type || ''}
              onChange={e => setFilters(f => ({ ...f, task_type: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All types</option>
              {filterOptions.taskTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="px-4 py-2 bg-grass-600 text-white rounded-lg text-sm font-medium hover:bg-grass-700"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin text-4xl mb-2">⏳</div>
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : (
        <>
          {/* Sessions View */}
          {viewMode === 'sessions' && (
            <div className="space-y-4">
              {sessions.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
                  No sessions recorded yet. Start logging your work!
                </div>
              ) : (
                sessions.map(session => (
                  <div
                    key={session.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                  >
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {formatDate(session.date)}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {session.total_tasks || 0} tasks • Started{' '}
                          {new Date(session.started_at || '').toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setSelectedDate(selectedDate === session.date ? '' : session.date)
                        }
                        className="text-grass-600 hover:text-grass-700 text-sm font-medium"
                      >
                        {selectedDate === session.date ? 'Hide' : 'View'} Details
                      </button>
                    </div>
                    {selectedDate === session.date && (
                      <div className="p-4">
                        {logsByDate[session.date]?.length > 0 ? (
                          <WorkLogTable logs={logsByDate[session.date]} />
                        ) : (
                          <p className="text-gray-500 text-sm">No logs for this session</p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Logs View */}
          {viewMode === 'logs' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-800">All Work Logs</h3>
                <p className="text-sm text-gray-500">{logs.length} entries</p>
              </div>
              <div className="p-4 overflow-x-auto">
                {logs.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No logs found</p>
                ) : (
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Area</th>
                        <th>Task</th>
                        <th>Description</th>
                        <th>Machine</th>
                        <th>Height</th>
                        <th>Duration</th>
                        <th>Staff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap">{formatDate(log.date)}</td>
                          <td>{log.area || '-'}</td>
                          <td>
                            {log.task_type ? (
                              <span className="px-2 py-0.5 bg-grass-100 text-grass-700 rounded text-xs">
                                {log.task_type}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="text-sm text-gray-600">{log.task_description || '-'}</td>
                          <td>{log.machine || '-'}</td>
                          <td>{log.height_mm ? `${log.height_mm}mm` : '-'}</td>
                          <td>
                            {log.duration_minutes
                              ? log.duration_minutes >= 60
                                ? `${Math.floor(log.duration_minutes / 60)}h ${log.duration_minutes % 60}m`
                                : `${log.duration_minutes}m`
                              : '-'}
                          </td>
                          <td>{log.staff || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Stats View */}
          {viewMode === 'stats' && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Summary Cards */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-3xl font-bold text-grass-600">{stats.total_tasks}</div>
                <div className="text-sm text-gray-500">Total Tasks</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-3xl font-bold text-grass-600">{stats.total_sessions}</div>
                <div className="text-sm text-gray-500">Sessions</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-3xl font-bold text-grass-600">{stats.total_hours}</div>
                <div className="text-sm text-gray-500">Hours Logged</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-3xl font-bold text-red-500">{stats.issues.length}</div>
                <div className="text-sm text-gray-500">Issue Types</div>
              </div>

              {/* Tasks by Type */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:col-span-2">
                <h3 className="font-semibold text-gray-800 mb-3">Tasks by Type</h3>
                <div className="space-y-2">
                  {stats.tasks_by_type.map(({ task_type, count }) => (
                    <div key={task_type} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-grass-500 h-full rounded-full"
                          style={{
                            width: `${(count / stats.total_tasks) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-700 w-24">{task_type}</span>
                      <span className="text-sm text-gray-500 w-8">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks by Area */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:col-span-2">
                <h3 className="font-semibold text-gray-800 mb-3">Tasks by Area</h3>
                <div className="space-y-2">
                  {stats.tasks_by_area.map(({ area, count }) => (
                    <div key={area} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full"
                          style={{
                            width: `${(count / stats.total_tasks) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-700 w-24">{area}</span>
                      <span className="text-sm text-gray-500 w-8">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Machine Usage */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:col-span-2">
                <h3 className="font-semibold text-gray-800 mb-3">Machine Usage</h3>
                <div className="flex flex-wrap gap-2">
                  {stats.machine_usage.map(({ machine, count }) => (
                    <span
                      key={machine}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                    >
                      {machine}: {count}
                    </span>
                  ))}
                </div>
              </div>

              {/* Issues */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:col-span-2">
                <h3 className="font-semibold text-gray-800 mb-3">Issues</h3>
                {stats.issues.length === 0 ? (
                  <p className="text-gray-500 text-sm">No issues recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {stats.issues.map(({ issue_type, count }) => (
                      <span
                        key={issue_type}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm"
                      >
                        {issue_type}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
