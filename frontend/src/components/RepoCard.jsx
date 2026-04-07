import React from 'react';
import { useNavigate } from 'react-router-dom';

const statusStyles = {
  Active: 'bg-green-500/20 text-green-400 border border-green-500/30',
  Processing: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  Idle: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

const RepoCard = ({ repo, jobStatus, onRegenerate, onDelete }) => {
  const navigate = useNavigate();
  const isProcessing = jobStatus === 'PENDING' || jobStatus === 'PROCESSING';

  // Determine display status
  let displayStatus = 'Idle';
  if (isProcessing) displayStatus = 'Processing';
  else if (repo.lastGeneratedAt) displayStatus = 'Active';

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-colors flex flex-col h-full relative">
      {isProcessing && (
        <div className="absolute inset-0 bg-gray-900/40 rounded-xl flex items-center justify-center z-10 backdrop-blur-[1px]">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mb-3"></div>
            <span className="text-sm text-purple-300 font-medium">Generating docs...</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-white mb-1 truncate">{repo.name}</h3>
          <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[displayStatus]}`}>
            {displayStatus}
          </span>
        </div>
        <button
          onClick={() => onDelete(repo.id)}
          className="text-gray-500 hover:text-red-400 transition-colors ml-2 text-sm"
          title="Delete repo"
        >
          ✕
        </button>
      </div>

      <p className="text-gray-400 mb-6 flex-grow text-sm leading-relaxed truncate">
        {repo.description || repo.githubUrl}
      </p>

      <div className="text-sm text-gray-500 mb-6 font-medium">
        Last generated: {formatDate(repo.lastGeneratedAt)}
      </div>

      <div className="flex space-x-3 mt-auto">
        <button
          onClick={() => navigate(`/docs/${repo.id}`)}
          disabled={!repo.lastGeneratedAt}
          className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 px-4 rounded-md font-medium transition-colors shadow-sm disabled:cursor-not-allowed"
        >
          View Docs
        </button>
        <button
          onClick={() => onRegenerate(repo.id)}
          disabled={isProcessing}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded-md font-medium transition-colors border border-gray-600 shadow-sm disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Working...' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
};

export default RepoCard;
