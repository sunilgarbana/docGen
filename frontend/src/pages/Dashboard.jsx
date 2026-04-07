import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import RepoCard from '../components/RepoCard';
import useStore from '../store/useStore';

const Dashboard = () => {
  const {
    currentUser, fetchCurrentUser, logout,
    repos, reposLoading, fetchRepos, addRepo, deleteRepo,
    activeJobs, triggerJob, pollJobStatus, clearJob,
  } = useStore();

  const [showModal, setShowModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollTimers = useRef({});

  // Fetch user and repos on mount
  useEffect(() => {
    fetchCurrentUser();
    fetchRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll active jobs
  const startPolling = useCallback((repoId, jobId) => {
    if (pollTimers.current[repoId]) clearInterval(pollTimers.current[repoId]);

    pollTimers.current[repoId] = setInterval(async () => {
      try {
        const status = await pollJobStatus(repoId, jobId);
        if (status === 'DONE') {
          clearInterval(pollTimers.current[repoId]);
          delete pollTimers.current[repoId];
          clearJob(repoId);
          fetchRepos();
          toast.success('Documentation generated successfully!');
        } else if (status === 'FAILED') {
          clearInterval(pollTimers.current[repoId]);
          delete pollTimers.current[repoId];
          clearJob(repoId);
          toast.error('Doc generation failed. Please try again.');
        }
      } catch {
        clearInterval(pollTimers.current[repoId]);
        delete pollTimers.current[repoId];
      }
    }, 3000);
  }, [pollJobStatus, clearJob, fetchRepos]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  const handleAddRepo = async () => {
    if (!urlInput.trim()) return;
    setSubmitting(true);
    try {
      const repo = await addRepo(urlInput.trim());
      toast.success(`Added ${repo.name}`);

      // Auto-trigger generation
      const jobId = await triggerJob(repo.id);
      startPolling(repo.id, jobId);
      toast('Generating docs...', { icon: '⏳' });

      setUrlInput('');
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add repo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerate = async (repoId) => {
    try {
      const jobId = await triggerJob(repoId);
      startPolling(repoId, jobId);
      toast('Regenerating docs...', { icon: '⏳' });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to trigger job');
    }
  };

  const handleDelete = async (repoId) => {
    try {
      await deleteRepo(repoId);
      toast.success('Repo removed');
    } catch {
      toast.error('Failed to delete repo');
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-900 text-white font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 bg-[#111827] flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-gray-800">
          <div className="text-2xl font-bold text-white tracking-tight">DocGen</div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <a href="/dashboard" className="flex items-center px-4 py-3 text-purple-400 bg-purple-500/10 rounded-lg font-medium transition-colors">
            My Repos
          </a>
          <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors font-medium">
            Jobs
          </a>
          <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors font-medium">
            Settings
          </a>
        </nav>

        <div className="p-4 border-t border-gray-800 shrink-0">
          <div className="flex items-center space-x-3 px-3 py-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-lg shrink-0 shadow-inner">
              {currentUser?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{currentUser?.name || 'User'}</p>
              <p className="text-xs text-gray-400 truncate">{currentUser?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full mt-2 text-sm text-gray-500 hover:text-red-400 transition-colors px-3 py-2 text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen bg-gray-900">
        <div className="p-10 max-w-7xl mx-auto">
          {/* Header */}
          <header className="flex justify-between items-center mb-10 border-b border-gray-800 pb-6">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">My Repositories</h1>
            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-md font-medium shadow-lg shadow-purple-500/20 transition-transform transform hover:-translate-y-0.5"
            >
              + Add Repo
            </button>
          </header>

          {/* Loading */}
          {reposLoading && (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {/* Empty state */}
          {!reposLoading && repos.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg mb-4">No repositories added yet.</p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-md font-medium transition-colors"
              >
                Add your first repo
              </button>
            </div>
          )}

          {/* Grid */}
          {!reposLoading && repos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {repos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  jobStatus={activeJobs[repo.id]?.status}
                  onRegenerate={handleRegenerate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 w-full max-w-lg shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-2">Add Repository</h2>
            <p className="text-gray-400 mb-6 text-sm">Paste a GitHub repository URL to generate documentation.</p>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors mb-6"
              onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
              autoFocus
            />
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => { setShowModal(false); setUrlInput(''); }}
                className="px-5 py-2.5 rounded-md text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRepo}
                disabled={submitting || !urlInput.trim()}
                className="px-5 py-2.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition-colors shadow-md shadow-purple-500/20 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding...' : 'Add & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
