import { useState } from 'react';
import { QueryResponse } from '../types';
import { queryLogs } from '../api';

const EXAMPLE_QUERIES = [
  "Show me all work involving the Toro 3250",
  "How many times has someone got stuck this season?",
  "When did we last cut greens at 3.5mm?",
  "What machinery issues have we had?",
  "Show all mowing tasks from last week",
  "How much time was spent on backlapping?",
];

export default function QueryView() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const response = await queryLogs(query.trim());
      setResult(response);
      setQueryHistory(prev => [query, ...prev.slice(0, 9)]);
    } catch (err) {
      console.error('Query failed:', err);
      setResult({
        message: 'Failed to process query. Please try again.',
        summary: '',
        results: [],
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleExampleClick(exampleQuery: string) {
    setQuery(exampleQuery);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Query Panel */}
      <div className="lg:col-span-1 space-y-4">
        {/* Query Input */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Ask a Question</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask about your work history..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-grass-500 focus:border-transparent resize-none"
            />
            <button
              type="submit"
              disabled={!query.trim() || isLoading}
              className="w-full px-6 py-3 bg-grass-600 text-white rounded-lg font-medium hover:bg-grass-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Example Queries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Example Queries</h3>
          <div className="space-y-2">
            {EXAMPLE_QUERIES.map((example, idx) => (
              <button
                key={idx}
                onClick={() => handleExampleClick(example)}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-grass-50 hover:text-grass-700 rounded-lg transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Query History */}
        {queryHistory.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Recent Queries</h3>
            <div className="space-y-1">
              {queryHistory.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setQuery(q)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors truncate"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Panel */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[500px]">
          {!result && !isLoading && (
            <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-lg">Ask a question about your work logs</p>
              <p className="text-sm mt-2">
                Try questions like "Show all mowing work this week"
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center h-[500px]">
              <div className="animate-spin text-4xl mb-4">⏳</div>
              <p className="text-gray-500">Searching...</p>
            </div>
          )}

          {result && !isLoading && (
            <div className="p-4">
              {/* AI Response */}
              <div className="mb-4 p-4 bg-grass-50 rounded-lg border border-grass-200">
                <p className="text-grass-800">{result.message}</p>
                {result.summary && (
                  <p className="mt-2 text-sm text-grass-600 font-medium">
                    {result.summary}
                  </p>
                )}
              </div>

              {/* Results Table */}
              {result.results.length > 0 ? (
                <div className="overflow-x-auto">
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
                        <th>Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.map(log => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap">{formatDate(log.date)}</td>
                          <td>
                            {log.area ? (
                              <span className="text-grass-700 font-medium">{log.area}</span>
                            ) : '-'}
                          </td>
                          <td>
                            {log.task_type ? (
                              <span className="px-2 py-0.5 bg-grass-100 text-grass-700 rounded text-xs">
                                {log.task_type}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="text-sm text-gray-600 max-w-[200px] truncate">
                            {log.task_description || '-'}
                          </td>
                          <td>{log.machine || '-'}</td>
                          <td>
                            {log.height_mm ? (
                              <span className="font-mono text-sm">{log.height_mm}mm</span>
                            ) : '-'}
                          </td>
                          <td>
                            {log.duration_minutes
                              ? log.duration_minutes >= 60
                                ? `${Math.floor(log.duration_minutes / 60)}h ${log.duration_minutes % 60}m`
                                : `${log.duration_minutes}m`
                              : '-'}
                          </td>
                          <td>{log.staff || '-'}</td>
                          <td>
                            {log.issue_type ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                {log.issue_type}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No matching records found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
