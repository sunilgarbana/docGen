import { create } from 'zustand';
import api from '../lib/api';

const useStore = create((set) => ({
  // --- User State ---
  currentUser: null,
  isAuthenticated: !!localStorage.getItem('token'),

  fetchCurrentUser: async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      set({ currentUser: data.user, isAuthenticated: true });
    } catch {
      set({ currentUser: null, isAuthenticated: false });
      localStorage.removeItem('token');
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ currentUser: null, isAuthenticated: false, repos: [] });
    window.location.href = '/';
  },

  // --- Repos State ---
  repos: [],
  reposLoading: false,

  fetchRepos: async () => {
    set({ reposLoading: true });
    try {
      const { data } = await api.get('/api/repos');
      set({ repos: data.repos, reposLoading: false });
    } catch {
      set({ reposLoading: false });
    }
  },

  addRepo: async (githubUrl) => {
    const { data } = await api.post('/api/repos', { githubUrl });
    set((state) => ({ repos: [data.repo, ...state.repos] }));
    return data.repo;
  },

  deleteRepo: async (id) => {
    await api.delete(`/api/repos/${id}`);
    set((state) => ({ repos: state.repos.filter((r) => r.id !== id) }));
  },

  // --- Job State ---
  activeJobs: {}, // { [repoId]: { jobId, status } }

  triggerJob: async (repoId) => {
    const { data } = await api.post('/api/jobs', { repoId });
    set((state) => ({
      activeJobs: {
        ...state.activeJobs,
        [repoId]: { jobId: data.jobId, status: 'PENDING' },
      },
    }));
    return data.jobId;
  },

  pollJobStatus: async (repoId, jobId) => {
    const { data } = await api.get(`/api/jobs/${jobId}`);
    const status = data.job.status;
    set((state) => ({
      activeJobs: {
        ...state.activeJobs,
        [repoId]: { jobId, status },
      },
    }));
    return status;
  },

  clearJob: (repoId) => {
    set((state) => {
      const jobs = { ...state.activeJobs };
      delete jobs[repoId];
      return { activeJobs: jobs };
    });
  },
}));

export default useStore;
