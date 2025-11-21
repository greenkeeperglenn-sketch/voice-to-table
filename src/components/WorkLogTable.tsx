import { useState } from 'react';
import { WorkLog } from '../types';

interface WorkLogTableProps {
  logs: WorkLog[];
  onUpdate?: (id: string, updates: Partial<WorkLog>) => void;
  onDelete?: (id: string) => void;
  editable?: boolean;
  compact?: boolean;
}

export default function WorkLogTable({
  logs,
  onUpdate,
  onDelete,
  editable = false,
  compact = false,
}: WorkLogTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<WorkLog>>({});

  function startEdit(log: WorkLog) {
    setEditingId(log.id);
    setEditValues(log);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  function saveEdit() {
    if (editingId && onUpdate) {
      onUpdate(editingId, editValues);
    }
    cancelEdit();
  }

  function handleInputChange(field: keyof WorkLog, value: string | number) {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }

  // Determine which columns to show based on available data
  const hasTimeData = logs.some(l => l.time_start || l.time_end || l.duration_minutes);
  const hasMachineData = logs.some(l => l.machine);
  const hasHeightData = logs.some(l => l.height_mm);
  const hasStaffData = logs.some(l => l.staff);
  const hasIssueData = logs.some(l => l.issue_type || l.issue_description);

  return (
    <div className="overflow-x-auto">
      <table className="log-table">
        <thead>
          <tr>
            <th className="min-w-[100px]">Area</th>
            <th className="min-w-[100px]">Task</th>
            {!compact && <th className="min-w-[200px]">Description</th>}
            {hasMachineData && <th className="min-w-[120px]">Machine</th>}
            {hasHeightData && <th className="min-w-[80px]">Height</th>}
            {hasTimeData && <th className="min-w-[80px]">Duration</th>}
            {hasStaffData && <th className="min-w-[100px]">Staff</th>}
            {hasIssueData && <th className="min-w-[150px]">Issues</th>}
            {editable && <th className="w-20">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="fade-in">
              {editingId === log.id ? (
                // Edit mode
                <>
                  <td>
                    <input
                      type="text"
                      value={editValues.area || ''}
                      onChange={e => handleInputChange('area', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={editValues.task_type || ''}
                      onChange={e => handleInputChange('task_type', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </td>
                  {!compact && (
                    <td>
                      <input
                        type="text"
                        value={editValues.task_description || ''}
                        onChange={e => handleInputChange('task_description', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                  )}
                  {hasMachineData && (
                    <td>
                      <input
                        type="text"
                        value={editValues.machine || ''}
                        onChange={e => handleInputChange('machine', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                  )}
                  {hasHeightData && (
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        value={editValues.height_mm || ''}
                        onChange={e => handleInputChange('height_mm', parseFloat(e.target.value))}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                  )}
                  {hasTimeData && (
                    <td>
                      <input
                        type="number"
                        value={editValues.duration_minutes || ''}
                        onChange={e => handleInputChange('duration_minutes', parseInt(e.target.value))}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="mins"
                      />
                    </td>
                  )}
                  {hasStaffData && (
                    <td>
                      <input
                        type="text"
                        value={editValues.staff || ''}
                        onChange={e => handleInputChange('staff', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                  )}
                  {hasIssueData && (
                    <td>
                      <input
                        type="text"
                        value={editValues.issue_description || ''}
                        onChange={e => handleInputChange('issue_description', e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </td>
                  )}
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={saveEdit}
                        className="px-2 py-1 bg-grass-600 text-white rounded text-xs hover:bg-grass-700"
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                // View mode
                <>
                  <td>
                    <span className={log.area ? 'text-grass-700 font-medium' : 'text-gray-400'}>
                      {log.area || '-'}
                    </span>
                  </td>
                  <td>
                    {log.task_type ? (
                      <span className="px-2 py-0.5 bg-grass-100 text-grass-700 rounded text-xs">
                        {log.task_type}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  {!compact && (
                    <td className="text-gray-600 text-sm">
                      {log.task_description || '-'}
                    </td>
                  )}
                  {hasMachineData && (
                    <td className="text-gray-700">{log.machine || '-'}</td>
                  )}
                  {hasHeightData && (
                    <td>
                      {log.height_mm ? (
                        <span className="font-mono text-sm">{log.height_mm}mm</span>
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  {hasTimeData && (
                    <td>
                      {log.duration_minutes ? (
                        <span className="text-sm">
                          {log.duration_minutes >= 60
                            ? `${Math.floor(log.duration_minutes / 60)}h ${log.duration_minutes % 60}m`
                            : `${log.duration_minutes}m`}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  {hasStaffData && (
                    <td className="text-gray-700">{log.staff || '-'}</td>
                  )}
                  {hasIssueData && (
                    <td>
                      {log.issue_type || log.issue_description ? (
                        <span className="text-red-600 text-sm">
                          {log.issue_type && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs mr-1">
                              {log.issue_type}
                            </span>
                          )}
                          {log.issue_description}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  {editable && (
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(log)}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => onDelete?.(log.id)}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-red-100 hover:text-red-600"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
