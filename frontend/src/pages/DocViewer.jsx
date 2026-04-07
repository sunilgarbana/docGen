/* eslint-disable no-unused-vars */
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import api from '../lib/api';
import useStore from '../store/useStore';

const TABS = [
  { key: 'readme', label: 'README', format: 'MARKDOWN' },
  { key: 'api', label: 'API Reference', format: 'OPENAPI' },
  { key: 'docstrings', label: 'Docstrings', format: 'DOCSTRING' },
];

const DocViewer = () => {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { triggerJob, pollJobStatus, clearJob } = useStore();

  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('readme');
  const [repoName, setRepoName] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/docs/${repoId}`);
      const mapped = {};
      for (const doc of data.docs) {
        mapped[doc.format] = doc;
      }
      setDocs(mapped);
      if (data.docs.length > 0) {
        setLastUpdated(new Date(data.docs[0].createdAt).toLocaleString());
      }
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error('No docs generated yet for this repo.');
      }
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    // Fetch repo name
    api.get('/api/repos').then(({ data }) => {
      const repo = data.repos.find((r) => r.id === repoId);
      if (repo) setRepoName(repo.name);
    });
    fetchDocs();
  }, [repoId, fetchDocs]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const jobId = await triggerJob(repoId);
      toast('Regenerating docs...', { icon: '⏳' });

      const poll = setInterval(async () => {
        try {
          const status = await pollJobStatus(repoId, jobId);
          if (status === 'DONE') {
            clearInterval(poll);
            clearJob(repoId);
            setRegenerating(false);
            toast.success('Docs regenerated!');
            fetchDocs();
          } else if (status === 'FAILED') {
            clearInterval(poll);
            clearJob(repoId);
            setRegenerating(false);
            toast.error('Regeneration failed.');
          }
        } catch {
          clearInterval(poll);
          setRegenerating(false);
        }
      }, 3000);
    } catch (err) {
      toast.error('Failed to start regeneration');
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    const currentFormat = TABS.find((t) => t.key === activeTab)?.format;
    const content = docs[currentFormat]?.content || '';
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  };

  const handleDownload = () => {
    const currentFormat = TABS.find((t) => t.key === activeTab)?.format;
    const content = docs[currentFormat]?.content || '';
    const ext = activeTab === 'docstrings' ? 'json' : 'md';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${repoName || 'docs'}-${activeTab}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentFormat = TABS.find((t) => t.key === activeTab)?.format;
  const currentContent = docs[currentFormat]?.content || '';

  // Extract headings for TOC from README content
  const tocItems = [];
  if (activeTab === 'readme' && currentContent) {
    const headingRegex = /^#{2,3}\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(currentContent)) !== null) {
      const title = match[1].trim();
      const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      tocItems.push({ id, title });
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-gray-200 font-sans">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0d1117] z-10 sticky top-0">
        <div className="flex items-center space-x-6">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Back
          </button>
          <div className="text-xl font-bold text-white tracking-tight">{repoName || 'Loading...'}</div>
          <div className="text-sm text-gray-500">Last updated: {lastUpdated || '—'}</div>
        </div>

        <div className="flex space-x-3">
          <button onClick={handleCopy} className="text-gray-300 hover:text-white px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 text-sm font-medium shadow-sm">
            Copy
          </button>
          <button onClick={handleDownload} className="text-gray-300 hover:text-white px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700 text-sm font-medium shadow-sm">
            Download
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-5 py-2 rounded-md text-sm font-medium transition-colors shadow-md shadow-purple-500/20 disabled:cursor-not-allowed"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate Docs'}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-[#0d1117] px-6 flex space-x-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* TOC Sidebar (only for README tab) */}
        {activeTab === 'readme' && tocItems.length > 0 && (
          <aside className="w-64 border-r border-gray-800 bg-[#0d1117]/80 p-6 hidden md:block overflow-y-auto shrink-0">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-6">Contents</h3>
            <nav className="space-y-3">
              {tocItems.map((item) => (
                <a key={item.id} href={`#${item.id}`} className="block text-sm font-medium text-gray-400 hover:text-purple-400 transition-colors">
                  {item.title}
                </a>
              ))}
            </nav>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 p-8 md:p-12 overflow-y-auto bg-[#0a0d14]">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : !currentContent ? (
            <div className="text-center py-20 text-gray-500">
              <p className="mb-4">No content available for this tab.</p>
              <button onClick={handleRegenerate} className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-md font-medium">
                Generate Docs
              </button>
            </div>
          ) : activeTab === 'docstrings' ? (
            <div className="max-w-4xl mx-auto space-y-4">
              {(() => {
                try {
                  const items = JSON.parse(currentContent);
                  return items.map((item, idx) => (
                    <div key={idx} className="bg-gray-800/50 border border-gray-700 rounded-lg p-5">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="text-purple-400 font-mono text-sm">{item.filePath}</span>
                        <span className="text-gray-600">→</span>
                        <span className="text-white font-semibold">{item.functionName}</span>
                      </div>
                      <pre className="text-sm text-gray-300 bg-gray-900 rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
                        {item.suggestedDocstring}
                      </pre>
                    </div>
                  ));
                } catch {
                  return <pre className="text-sm text-gray-300 whitespace-pre-wrap">{currentContent}</pre>;
                }
              })()}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              <ReactMarkdown
                components={{
                  code({ node: _n, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-lg my-6 shadow-xl border border-gray-800/60" {...props}>
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className="bg-gray-800/80 px-1.5 py-0.5 rounded-md text-purple-300 text-[0.9em] border border-gray-700/50" {...props}>{children}</code>
                    );
                  },
                  h1: ({ node: _n, ...props }) => <h1 className="text-4xl font-extrabold mb-8 pb-4 border-b border-gray-800 text-white tracking-tight" {...props} />,
                  h2: ({ node: _n, ...props }) => {
                    const text = String(props.children);
                    const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                    return <h2 id={id} className="text-2xl font-bold mt-12 mb-6 text-white tracking-tight" {...props} />;
                  },
                  h3: ({ node: _n, ...props }) => <h3 className="text-xl font-semibold mt-10 mb-4 text-gray-100" {...props} />,
                  p: ({ node: _n, ...props }) => <p className="mb-6 leading-relaxed text-gray-400 text-[1.05rem]" {...props} />,
                  ul: ({ node: _n, ...props }) => <ul className="list-disc list-inside mb-6 space-y-2 text-gray-400 text-[1.05rem]" {...props} />,
                  li: ({ node: _n, ...props }) => <li className="pl-2" {...props} />,
                  strong: ({ node: _n, ...props }) => <strong className="font-semibold text-gray-200" {...props} />,
                  table: ({ node: _n, ...props }) => <table className="w-full my-6 border border-gray-700 rounded-lg overflow-hidden" {...props} />,
                  th: ({ node: _n, ...props }) => <th className="bg-gray-800 text-left px-4 py-3 text-sm font-semibold text-gray-200 border-b border-gray-700" {...props} />,
                  td: ({ node: _n, ...props }) => <td className="px-4 py-3 text-sm text-gray-400 border-b border-gray-800" {...props} />,
                }}
              >
                {currentContent}
              </ReactMarkdown>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DocViewer;
